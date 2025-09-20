package api

import (
	"net/http"
	"strconv"
	"time"

	"github.com/QuickDeployAI/MCP-Registry/internal/service"
	"github.com/QuickDeployAI/MCP-Registry/pkg/types"
	"github.com/gin-gonic/gin"
)

// Handler provides HTTP handlers for the MCP registry API
type Handler struct {
	service *service.RegistryService
	version string
}

// NewHandler creates a new API handler
func NewHandler(service *service.RegistryService) *Handler {
	return &Handler{
		service: service,
		version: "0.1.0",
	}
}

// SetupRoutes configures the API routes
func (h *Handler) SetupRoutes(router *gin.Engine) {
	// Health check
	router.GET("/health", h.HealthCheck)
	
	// API v0 routes
	v0 := router.Group("/v0")
	{
		v0.GET("/servers", h.ListServers)
		v0.GET("/servers/:id", h.GetServer)
		v0.POST("/publish", h.PublishServer)
	}
	
	// Add CORS middleware
	router.Use(func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization")
		
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		
		c.Next()
	})
}

// HealthCheck handles health check requests
func (h *Handler) HealthCheck(c *gin.Context) {
	response := types.HealthResponse{
		Status:  "healthy",
		Version: h.version,
		Time:    time.Now().UTC().Format(time.RFC3339),
	}
	
	c.JSON(http.StatusOK, response)
}

// ListServers handles GET /v0/servers
func (h *Handler) ListServers(c *gin.Context) {
	// Parse query parameters
	limitStr := c.DefaultQuery("limit", "20")
	cursor := c.Query("cursor")
	query := c.Query("q") // Search query
	
	limit, err := strconv.Atoi(limitStr)
	if err != nil || limit <= 0 {
		limit = 20
	}
	
	if limit > 100 {
		limit = 100
	}
	
	var response *types.ServerListResponse
	
	if query != "" {
		// Search servers
		response, err = h.service.SearchServers(query, limit, cursor)
	} else {
		// List all servers
		response, err = h.service.ListServers(limit, cursor)
	}
	
	if err != nil {
		h.errorResponse(c, http.StatusInternalServerError, "Failed to retrieve servers", err.Error())
		return
	}
	
	c.JSON(http.StatusOK, response)
}

// GetServer handles GET /v0/servers/:id
func (h *Handler) GetServer(c *gin.Context) {
	id := c.Param("id")
	
	server, err := h.service.GetServer(id)
	if err != nil {
		h.errorResponse(c, http.StatusNotFound, "Server not found", err.Error())
		return
	}
	
	c.JSON(http.StatusOK, server)
}

// PublishServer handles POST /v0/publish
func (h *Handler) PublishServer(c *gin.Context) {
	var request types.PublishRequest
	
	if err := c.ShouldBindJSON(&request); err != nil {
		h.errorResponse(c, http.StatusBadRequest, "Invalid request body", err.Error())
		return
	}
	
	server, err := h.service.PublishServer(&request)
	if err != nil {
		// Determine appropriate status code
		statusCode := http.StatusBadRequest
		if contains(err.Error(), "validation failed") {
			statusCode = http.StatusBadRequest
		} else if contains(err.Error(), "not found") {
			statusCode = http.StatusNotFound
		} else {
			statusCode = http.StatusInternalServerError
		}
		
		h.errorResponse(c, statusCode, "Failed to publish server", err.Error())
		return
	}
	
	c.JSON(http.StatusCreated, server)
}

// errorResponse sends a standardized error response
func (h *Handler) errorResponse(c *gin.Context, statusCode int, error, message string) {
	response := types.ErrorResponse{
		Error:   error,
		Message: message,
		Code:    statusCode,
	}
	
	c.JSON(statusCode, response)
}

// contains checks if a string contains a substring (case-insensitive)
func contains(str, substr string) bool {
	return len(str) >= len(substr) && (str == substr || 
		(len(str) > len(substr) && 
		 str[:len(substr)] == substr || 
		 str[len(str)-len(substr):] == substr ||
		 indexOf(str, substr) >= 0))
}

// indexOf finds the index of a substring in a string
func indexOf(str, substr string) int {
	for i := 0; i <= len(str)-len(substr); i++ {
		if str[i:i+len(substr)] == substr {
			return i
		}
	}
	return -1
}