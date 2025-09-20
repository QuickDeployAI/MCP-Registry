package service

import (
	"fmt"
	"strings"

	"github.com/QuickDeployAI/MCP-Registry/internal/repository"
	"github.com/QuickDeployAI/MCP-Registry/pkg/types"
)

// RegistryService provides business logic for the MCP registry
type RegistryService struct {
	repo repository.Repository
}

// NewRegistryService creates a new registry service
func NewRegistryService(repo repository.Repository) *RegistryService {
	return &RegistryService{
		repo: repo,
	}
}

// ListServers returns a paginated list of servers
func (s *RegistryService) ListServers(limit int, cursor string) (*types.ServerListResponse, error) {
	servers, nextCursor, err := s.repo.ListServers(limit, cursor)
	if err != nil {
		return nil, fmt.Errorf("failed to list servers: %w", err)
	}
	
	return &types.ServerListResponse{
		Servers: servers,
		Metadata: types.Metadata{
			NextCursor: nextCursor,
			Count:      len(servers),
		},
	}, nil
}

// GetServer returns a server by ID
func (s *RegistryService) GetServer(id string) (*types.ServerJSON, error) {
	if id == "" {
		return nil, fmt.Errorf("server ID is required")
	}
	
	server, err := s.repo.GetServer(id)
	if err != nil {
		return nil, fmt.Errorf("server not found: %w", err)
	}
	
	return server, nil
}

// PublishServer publishes a new server to the registry
func (s *RegistryService) PublishServer(request *types.PublishRequest) (*types.ServerJSON, error) {
	// Validate the server data
	if err := s.validateServer(&request.ServerJSON); err != nil {
		return nil, fmt.Errorf("validation failed: %w", err)
	}
	
	// Check if server already exists (by name)
	existing, err := s.findServerByName(request.Name)
	if err == nil && existing != nil {
		// Update existing server
		return s.updateExistingServer(existing.GetID(), &request.ServerJSON)
	}
	
	// Create new server
	server, err := s.repo.CreateServer(&request.ServerJSON)
	if err != nil {
		return nil, fmt.Errorf("failed to create server: %w", err)
	}
	
	return server, nil
}

// SearchServers searches for servers by query
func (s *RegistryService) SearchServers(query string, limit int, cursor string) (*types.ServerListResponse, error) {
	if query == "" {
		// If no query, return all servers
		return s.ListServers(limit, cursor)
	}
	
	servers, nextCursor, err := s.repo.SearchServers(query, limit, cursor)
	if err != nil {
		return nil, fmt.Errorf("failed to search servers: %w", err)
	}
	
	return &types.ServerListResponse{
		Servers: servers,
		Metadata: types.Metadata{
			NextCursor: nextCursor,
			Count:      len(servers),
		},
	}, nil
}

// validateServer validates server data according to MCP spec
func (s *RegistryService) validateServer(server *types.ServerJSON) error {
	if server.Name == "" {
		return fmt.Errorf("server name is required")
	}
	
	if len(server.Name) > 200 {
		return fmt.Errorf("server name must be at most 200 characters")
	}
	
	if server.Description == "" {
		return fmt.Errorf("server description is required")
	}
	
	if len(server.Description) > 100 {
		return fmt.Errorf("server description must be at most 100 characters")
	}
	
	if server.Version == "" {
		return fmt.Errorf("server version is required")
	}
	
	// Validate packages
	for i, pkg := range server.Packages {
		if err := s.validatePackage(&pkg); err != nil {
			return fmt.Errorf("package %d validation failed: %w", i, err)
		}
	}
	
	// Set default status if not provided
	if server.Status == "" {
		server.Status = types.StatusActive
	}
	
	return nil
}

// validatePackage validates a package configuration
func (s *RegistryService) validatePackage(pkg *types.Package) error {
	if pkg.RegistryType == "" {
		return fmt.Errorf("package registry_type is required")
	}
	
	if pkg.Identifier == "" {
		return fmt.Errorf("package identifier is required")
	}
	
	if pkg.Version == "" {
		return fmt.Errorf("package version is required")
	}
	
	// Validate known registry types
	validTypes := []string{"npm", "pypi", "oci", "mcpb", "git"}
	isValid := false
	for _, validType := range validTypes {
		if pkg.RegistryType == validType {
			isValid = true
			break
		}
	}
	
	if !isValid {
		return fmt.Errorf("unsupported registry_type: %s", pkg.RegistryType)
	}
	
	return nil
}

// findServerByName finds a server by name (helper function)
func (s *RegistryService) findServerByName(name string) (*types.ServerJSON, error) {
	// This is a simple implementation - in a real system, you'd want indexed search
	servers, _, err := s.repo.ListServers(1000, "") // Get a large batch
	if err != nil {
		return nil, err
	}
	
	for _, server := range servers {
		if strings.EqualFold(server.Name, name) {
			return &server, nil
		}
	}
	
	return nil, fmt.Errorf("server not found")
}

// updateExistingServer updates an existing server
func (s *RegistryService) updateExistingServer(id string, server *types.ServerJSON) (*types.ServerJSON, error) {
	updated, err := s.repo.UpdateServer(id, server)
	if err != nil {
		return nil, fmt.Errorf("failed to update server: %w", err)
	}
	
	return updated, nil
}