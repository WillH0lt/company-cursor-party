package controllers

import (
	"encoding/base64"
	"fmt"

	"github.com/willH0lt/company-cursor-party/backend/shared/models"
	"github.com/willH0lt/company-cursor-party/backend/ws/socket"
	socketio "github.com/zishang520/socket.io/v2/socket"
	"google.golang.org/protobuf/proto"
)

const (
	RoomName = "room"

	EventJoin  = "join"
	EventLeave = "leave"
	EventMove  = "move"
)

type RoomController struct{}

func (r RoomController) Join(clients ...any) {
	io := socket.GetIo()

	client := clients[0].(*socketio.Socket)
	client.Join(RoomName)

	io.To(RoomName).Emit(EventJoin, r.nClients())

	client.On("disconnect", func(...any) {
		io.To(RoomName).Emit(EventLeave, r.nClients())
	})

	client.On(EventMove, func(datas ...any) {
		if err := handleEventMove(client, datas[0]); err != nil {
			fmt.Printf("Error handling event move: %v\n", err)
		}
	})
}

func handleEventMove(client *socketio.Socket, data any) error {
	str, ok := data.(string)
	if !ok {
		return fmt.Errorf("data is not a string")
	}

	byteData, err := base64.StdEncoding.DecodeString(str)
	if err != nil {
		return err
	}

	var position models.Position
	if err := proto.Unmarshal(byteData, &position); err != nil {
		return fmt.Errorf("error unmarshalling position: %w", err)
	}

	if err := client.Broadcast().To(RoomName).Emit(EventMove, data); err != nil {
		return err
	}

	return nil
}

func (r RoomController) nClients() int {
	io := socket.GetIo()

	room, ok := io.Sockets().Adapter().Rooms().Load(RoomName)
	var size int
	if !ok {
		size = 0
	} else {
		size = room.Len()
	}

	return size
}
