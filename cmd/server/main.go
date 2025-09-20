package main

import (
	"fmt"
	"log"

	"github.com/QuickDeployAI/MCP-Registry/internal/api"
	"github.com/QuickDeployAI/MCP-Registry/internal/config"
	"github.com/QuickDeployAI/MCP-Registry/internal/repository"
	"github.com/QuickDeployAI/MCP-Registry/internal/service"
	"github.com/gin-gonic/gin"
)

func main() {
	// Load configuration
	cfg := config.Load()
	
	// Set up logging
	if cfg.Log.Level == "debug" {
		gin.SetMode(gin.DebugMode)
	} else {
		gin.SetMode(gin.ReleaseMode)
	}
	
	// Create repository
	var repo repository.Repository
	switch cfg.Database.Type {
	case "memory":
		repo = repository.NewMemoryRepository()
		log.Println("Using in-memory storage")
	default:
		// For now, fall back to memory if unknown type
		repo = repository.NewMemoryRepository()
		log.Printf("Unknown database type '%s', falling back to in-memory storage", cfg.Database.Type)
	}
	
	// Create service
	registryService := service.NewRegistryService(repo)
	
	// Create API handler
	handler := api.NewHandler(registryService)
	
	// Setup Gin router
	router := gin.Default()
	
	// Setup routes
	handler.SetupRoutes(router)
	
	// Start server
	address := fmt.Sprintf("%s:%d", cfg.Server.Host, cfg.Server.Port)
	log.Printf("Starting MCP Registry server on %s", address)
	
	if err := router.Run(address); err != nil {
		log.Fatal("Failed to start server:", err)
	}
}