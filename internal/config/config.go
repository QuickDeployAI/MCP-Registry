package config

import (
	"os"
	"strconv"
)

// Config holds all configuration for the application
type Config struct {
	Server   ServerConfig
	Database DatabaseConfig
	Auth     AuthConfig
	Log      LogConfig
}

// ServerConfig holds server-specific configuration
type ServerConfig struct {
	Host string
	Port int
}

// DatabaseConfig holds database configuration
type DatabaseConfig struct {
	Type string // "memory" or "postgres"
	URL  string // connection string for postgres
}

// AuthConfig holds authentication configuration
type AuthConfig struct {
	Enabled    bool
	JWTSecret  string
	GitHubAuth bool
}

// LogConfig holds logging configuration
type LogConfig struct {
	Level string // debug, info, warn, error
}

// Load loads configuration from environment variables
func Load() *Config {
	return &Config{
		Server: ServerConfig{
			Host: getEnvString("HOST", "0.0.0.0"),
			Port: getEnvInt("PORT", 8080),
		},
		Database: DatabaseConfig{
			Type: getEnvString("DB_TYPE", "memory"),
			URL:  getEnvString("DATABASE_URL", ""),
		},
		Auth: AuthConfig{
			Enabled:    getEnvBool("AUTH_ENABLED", false),
			JWTSecret:  getEnvString("JWT_SECRET", ""),
			GitHubAuth: getEnvBool("GITHUB_AUTH", false),
		},
		Log: LogConfig{
			Level: getEnvString("LOG_LEVEL", "info"),
		},
	}
}

// Helper functions
func getEnvString(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func getEnvInt(key string, defaultValue int) int {
	if value := os.Getenv(key); value != "" {
		if intValue, err := strconv.Atoi(value); err == nil {
			return intValue
		}
	}
	return defaultValue
}

func getEnvBool(key string, defaultValue bool) bool {
	if value := os.Getenv(key); value != "" {
		if boolValue, err := strconv.ParseBool(value); err == nil {
			return boolValue
		}
	}
	return defaultValue
}