package server

import "github.com/willH0lt/company-cursor-party/backend/ws/config"

func Init() {
	config := config.GetConfig()
	r := NewRouter()
	r.Run(":" + config.Port)
}
