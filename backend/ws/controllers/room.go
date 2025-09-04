package controllers

import (
	"fmt"

	"github.com/willH0lt/company-cursor-party/backend/shared/models"
	"github.com/willH0lt/company-cursor-party/backend/ws/socket"
	"github.com/zishang520/engine.io-go-parser/types"
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

	io.To(RoomName).Emit(EventJoin)

	client.On("disconnect", func(...any) {
		io.To(RoomName).Emit(EventLeave, client.Id())
	})

	client.On(EventMove, func(datas ...any) {
		if err := handleEventMove(client, datas[0]); err != nil {
			fmt.Printf("Error handling event move: %v\n", err)
		}
	})
}

func handleEventMove(client *socketio.Socket, data any) error {
	buf, ok := data.(types.BufferInterface)
	if !ok {
		return fmt.Errorf("data is not binary")
	}

	var inputPosition models.InputPosition
	if err := proto.Unmarshal(buf.Bytes(), &inputPosition); err != nil {
		return fmt.Errorf("error unmarshalling position: %w", err)
	}

	position := &models.Position{
		Id:   string(client.Id()),
		X:    inputPosition.X,
		Y:    inputPosition.Y,
		Room: inputPosition.Room,
	}

	bytes, err := proto.Marshal(position)
	if err != nil {
		return fmt.Errorf("error marshalling position: %w", err)
	}

	if err := client.Broadcast().To(RoomName).Emit(EventMove, bytes); err != nil {
		return err
	}

	return nil
}
