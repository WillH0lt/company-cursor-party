package main

import (
	"github.com/willH0lt/company-cursor-party/backend/ws/server"
	"github.com/willH0lt/company-cursor-party/backend/ws/socket"
)

func main() {
	socket.Init()
	server.Init()
}
