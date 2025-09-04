import { io } from "socket.io-client";
import throttle from "lodash.throttle";

import { models } from "../models";

const cursorSvg =
  "<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><path fill='#FFF' stroke='#000' stroke-width='2' stroke-linejoin='round' d='M18 14.88 8.16 3.15c-.26-.31-.76-.12-.76.28v15.31c0 .36.42.56.7.33l3.1-2.6 1.55 4.25c.08.22.33.34.55.26l1.61-.59a.43.43 0 0 0 .26-.55l-1.55-4.25h4.05c.36 0 .56-.42.33-.7Z'></path></svg>";

const socket = io("https://ws-306467020824.us-central1.run.app", {
  transports: ["websocket"],
});

for (let i = 0; i < 50; i++) {
  const redSquare = document.createElement("div");
  redSquare.style.width = "100px";
  redSquare.style.height = "100px";
  redSquare.style.backgroundColor = "red";
  redSquare.style.position = "absolute";
  redSquare.style.top = `${Math.random() * (2000 - 100)}px`;
  redSquare.style.left = `${Math.random() * (window.innerWidth - 100)}px`;
  document.body.appendChild(redSquare);
}

interface CursorData {
  id: string;
  lastSeen: number;
  positions: { x: number; y: number; timestamp: number }[];
}

const cursors: Map<string, CursorData> = new Map();

const myCursorData: CursorData = {
  id: crypto.randomUUID(),
  lastSeen: Date.now(),
  positions: [],
};

// container for all cursor elements
const container = document.createElement("div");
container.style.position = "absolute";
container.style.top = "0";
container.style.left = "0";
container.style.width = "100%";
container.style.height = "100%";
container.style.overflow = "hidden";
container.style.pointerEvents = "none";
document.body.appendChild(container);

// Update my cursor position on mouse move
window.addEventListener("mousemove", (event) => {
  myCursorData.positions.push({
    x: event.pageX,
    y: event.pageY,
    timestamp: Date.now(),
  });

  const position = models.Position.fromObject({
    id: myCursorData.id,
    x: event.pageX,
    y: event.pageY,
  });
  sendPositionUpdate(position);
});

// Update cursor position on scroll
window.addEventListener("wheel", (e: WheelEvent) => {
  const lastPosition = myCursorData.positions[
    myCursorData.positions.length - 1
  ] || { x: 0, y: 0, timestamp: Date.now() };

  const nextPosition = {
    x: lastPosition.x + e.deltaX,
    y: lastPosition.y + e.deltaY,
    timestamp: Date.now(),
  };

  myCursorData.positions.push(nextPosition);

  // get new pageX and pageY for my cursor and send an update
  const position = models.Position.fromObject({
    id: myCursorData.id,
    x: nextPosition.x,
    y: nextPosition.y,
  });
  sendPositionUpdate(position);
});

// send position updates at most every 100ms
const sendPositionUpdate = throttle((position: models.Position) => {
  const bytes = position.serializeBinary();
  const data = window.btoa(String.fromCharCode(...bytes));
  socket.emit("move", data);
}, 100);

// Handle incoming cursor position updates
socket.on("move", (data: string) => {
  const bytes = new Uint8Array(
    window
      .atob(data)
      .split("")
      .map((c) => c.charCodeAt(0))
  );

  const position = models.Position.deserializeBinary(bytes);

  const now = Date.now();

  const positions = cursors.get(position.id)?.positions || [];
  positions.push({ x: position.x, y: position.y, timestamp: now });
  if (positions.length > 10) {
    positions.shift(); // keep only the last 10 positions
  }

  cursors.set(position.id, {
    id: position.id,
    lastSeen: now,
    positions,
  });
});

// Create a new cursor element and add it to the container
function createNewCursor(c: CursorData): HTMLDivElement {
  const cursor = document.createElement("div");
  cursor.id = c.id;
  cursor.innerHTML = cursorSvg;
  cursor.style.position = "absolute";
  cursor.style.left = `${c.positions[c.positions.length - 1].x}px`;
  cursor.style.top = `${c.positions[c.positions.length - 1].y}px`;
  cursor.style.pointerEvents = "none";
  container.appendChild(cursor);

  return cursor;
}

// Clean up old cursors every second
setInterval(() => {
  const now = Date.now();
  cursors.forEach((cursorData, cursorId) => {
    if (now - cursorData.lastSeen > 5000) {
      const cursorElement = document.getElementById(cursorId);
      if (cursorElement) {
        container.removeChild(cursorElement);
      }
      cursors.delete(cursorId);
    }
  });
}, 1000);

function animateCursors() {
  // interpolate cursor positions for smooth movement
  const now = Date.now();
  cursors.forEach((cursorData) => {
    // find two positions to interpolate between
    let previousPosition = null;
    let nextPosition = null;
    for (let i = cursorData.positions.length - 1; i >= 0; i--) {
      const pos = cursorData.positions[i];
      if (pos.timestamp <= now - 100) {
        previousPosition = pos;
        nextPosition = cursorData.positions[i + 1] || pos;
        break;
      }
    }

    let left = 0;
    let top = 0;
    if (previousPosition && nextPosition && previousPosition !== nextPosition) {
      const t =
        (now - 100 - previousPosition.timestamp) /
        (nextPosition.timestamp - previousPosition.timestamp);
      left = previousPosition.x + (nextPosition.x - previousPosition.x) * t;
      top = previousPosition.y + (nextPosition.y - previousPosition.y) * t;
    } else if (previousPosition) {
      // if no next position, just use the last known position
      left = previousPosition.x;
      top = previousPosition.y;
    }

    let cursorElement = document.getElementById(cursorData.id);
    if (!cursorElement) {
      cursorElement = createNewCursor({
        id: cursorData.id,
        lastSeen: cursorData.lastSeen,
        positions: cursorData.positions,
      });
    }

    cursorElement.style.left = `${left}px`;
    cursorElement.style.top = `${top}px`;
  });
}

requestAnimationFrame(function loop() {
  animateCursors();
  requestAnimationFrame(loop);
});
