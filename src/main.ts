import { io } from "socket.io-client";
import throttle from "lodash.throttle";
import { PerfectCursor } from "perfect-cursors";

import { models } from "../models";

const cursorSvg =
  "<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><path fill='#FFF' stroke='#000' stroke-width='2' stroke-linejoin='round' d='M18 14.88 8.16 3.15c-.26-.31-.76-.12-.76.28v15.31c0 .36.42.56.7.33l3.1-2.6 1.55 4.25c.08.22.33.34.55.26l1.61-.59a.43.43 0 0 0 .26-.55l-1.55-4.25h4.05c.36 0 .56-.42.33-.7Z'></path></svg>";

const socket = io(import.meta.env.VITE_WS_HOST || "http://localhost:8087", {
  transports: ["websocket"],
});

interface CursorData {
  id: string;
  lastSeen: number;
  pc: PerfectCursor;
  room: string;
}

if (import.meta.env.DEV) {
  const main = document.createElement("div");
  main.id = "main";
  main.style.height = "400vh"; // make it scrollable
  document.body.appendChild(main);

  // add red squares for testing
  for (let i = 0; i < 50; i++) {
    const square = document.createElement("a");
    square.style.position = "absolute";
    square.style.width = "20px";
    square.style.height = "20px";
    square.style.backgroundColor = "red";
    square.style.left = Math.random() * main.clientWidth + "px";
    square.style.top = Math.random() * main.clientHeight + "px";
    square.href = "/" + Math.floor(Math.random() * 5);
    main.appendChild(square);
  }
}

const cursors: Map<string, CursorData> = new Map();

const mainElement = document.getElementById("main");
if (!mainElement) throw new Error("No main element found");

// container for all cursor elements
const container = document.createElement("div");
container.style.position = "absolute";
container.style.top = "0";
container.style.left = "0";
container.style.width = mainElement.clientWidth - 1 + "px";
container.style.height = mainElement.clientHeight - 1 + "px";
container.style.overflow = "hidden";
container.style.pointerEvents = "none";
document.body.appendChild(container);

// when mainElement changes size, update container size
const resizeObserver = new ResizeObserver(() => {
  container.style.width = mainElement.clientWidth - 1 + "px";
  container.style.height = mainElement.clientHeight - 1 + "px";
});
resizeObserver.observe(mainElement);

// Update my cursor position on mouse move
window.addEventListener("mousemove", (e: MouseEvent) => {
  sendPositionUpdate(e.pageX, e.pageY);
});

// Update cursor position on scroll
window.addEventListener("wheel", (e: WheelEvent) => {
  sendPositionUpdate(e.pageX, e.pageY);
});

// when mouse leaves it just hangs out a bit offscreen
window.addEventListener("mouseout", (e: MouseEvent) => {
  const leavingLeft = e.clientX <= 0;
  const leavingRight = e.clientX >= window.innerWidth;
  const leavingTop = e.clientY <= 0;
  const leavingBottom = e.clientY >= window.innerHeight;

  sendPositionUpdate(
    e.pageX + (leavingLeft ? -100 : leavingRight ? 100 : 0),
    e.pageY + (leavingTop ? -100 : leavingBottom ? 100 : 0)
  );
});

// send position updates at most every 100ms
const sendPositionUpdate = throttle((pageX: number, pageY: number) => {
  const position = models.InputPosition.fromObject({
    x: pageX / container.offsetWidth,
    y: pageY / container.offsetHeight,
    room: hashUrl(),
  });

  const bytes = position.serializeBinary();
  socket.emit("move", bytes);
}, 100);

// Handle incoming cursor position updates
socket.on("move", (bytes: Uint8Array<ArrayBufferLike>) => {
  const position = models.Position.deserializeBinary(bytes);

  let cursorData = cursors.get(position.id);
  if (!cursorData) {
    cursorData = {
      id: position.id,
      lastSeen: 0,
      room: "",
      pc: new PerfectCursor((point: number[]) => {
        const cursorData = cursors.get(position.id);
        if (!cursorData) return;
        createOrUpdateCursor(cursorData, point[0], point[1]);
      }),
    };

    cursors.set(position.id, cursorData);
  }

  cursorData.room = position.room;
  cursorData.lastSeen = performance.now();
  cursorData.pc.addPoint([
    position.x * container.offsetWidth,
    position.y * container.offsetHeight,
  ]);
});

// delete cursor when someone disconnects
socket.on("leave", (id: string) => {
  destroyCursor(id);
});

// Clean up old cursors every second
setInterval(() => {
  const now = performance.now();
  cursors.forEach((cursorData, cursorId) => {
    if (now - cursorData.lastSeen > 5000) {
      destroyCursor(cursorId);
    }
  });
}, 1000);

// Detect URL changes to handle room changes
let currentUrl = window.location.href;
setInterval(() => {
  if (currentUrl !== window.location.href) {
    currentUrl = window.location.href;

    // hide all cursors when changing rooms
    container.childNodes.forEach((child) => {
      (child as HTMLElement).style.visibility = "hidden";
    });
  }
}, 50);

function createOrUpdateCursor(cursorData: CursorData, x: number, y: number) {
  let cursorElement = document.getElementById(cursorData.id);
  if (!cursorElement) {
    cursorElement = document.createElement("div");
    cursorElement.id = cursorData.id;
    cursorElement.innerHTML = cursorSvg;
    cursorElement.style.position = "absolute";
    cursorElement.style.pointerEvents = "none";
    container.appendChild(cursorElement);
  }

  cursorElement.style.setProperty("transform", `translate(${x}px, ${y}px)`);

  if (cursorData.room === hashUrl()) {
    cursorElement.style.visibility = "visible";
  } else {
    cursorElement.style.visibility = "hidden";
  }
}

function destroyCursor(id: string) {
  const cursorElement = document.getElementById(id);
  if (cursorElement) {
    container.removeChild(cursorElement);
  }

  const cursorData = cursors.get(id);
  if (cursorData) {
    cursorData.pc.dispose();
  }

  cursors.delete(id);
}

function hashUrl(): string {
  const input = window.location.href.split("?")[0];

  // hash function using djb2 algorithm
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) + hash + input.charCodeAt(i);
    hash = hash & hash; // Convert to 32-bit integer
  }

  // Convert to positive number and create base string
  hash = Math.abs(hash);
  let result = "";

  // Character set for output (alphanumeric)
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

  // Generate the hash string of desired length
  const outputLength = 10;
  for (let i = 0; i < outputLength; i++) {
    // Use the hash and position to generate pseudo-random indices
    const seed = hash + i * 7919; // 7919 is a prime number for better distribution
    const index = seed % chars.length;
    result += chars[index];

    // Update hash for next iteration to avoid repetition
    hash = ((hash << 3) + hash + i) & 0x7fffffff;
  }

  return result;
}
