package repository

import (
	"errors"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/QuickDeployAI/MCP-Registry/pkg/types"
	"github.com/google/uuid"
)

// Repository defines the interface for server data persistence
type Repository interface {
	// ListServers returns a paginated list of servers
	ListServers(limit int, cursor string) ([]types.ServerJSON, string, error)
	
	// GetServer returns a server by ID
	GetServer(id string) (*types.ServerJSON, error)
	
	// CreateServer creates a new server
	CreateServer(server *types.ServerJSON) (*types.ServerJSON, error)
	
	// UpdateServer updates an existing server
	UpdateServer(id string, server *types.ServerJSON) (*types.ServerJSON, error)
	
	// DeleteServer deletes a server by ID
	DeleteServer(id string) error
	
	// SearchServers searches for servers by name or description
	SearchServers(query string, limit int, cursor string) ([]types.ServerJSON, string, error)
}

// MemoryRepository provides an in-memory implementation of Repository
type MemoryRepository struct {
	mu      sync.RWMutex
	servers map[string]*types.ServerJSON
	order   []string // For consistent ordering
}

// NewMemoryRepository creates a new in-memory repository
func NewMemoryRepository() *MemoryRepository {
	repo := &MemoryRepository{
		servers: make(map[string]*types.ServerJSON),
		order:   make([]string, 0),
	}
	
	// Load some sample data
	repo.loadSampleData()
	
	return repo
}

// ListServers implements Repository.ListServers
func (r *MemoryRepository) ListServers(limit int, cursor string) ([]types.ServerJSON, string, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	
	// Handle default limit
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	
	startIdx := 0
	if cursor != "" {
		// Find the starting index based on cursor (simple implementation)
		for i, id := range r.order {
			if id == cursor {
				startIdx = i + 1
				break
			}
		}
	}
	
	var results []types.ServerJSON
	var nextCursor string
	
	for i := startIdx; i < len(r.order) && len(results) < limit; i++ {
		id := r.order[i]
		if server, exists := r.servers[id]; exists {
			results = append(results, *server)
		}
	}
	
	// Set next cursor if there are more results
	if startIdx+len(results) < len(r.order) {
		nextCursor = r.order[startIdx+len(results)-1]
	}
	
	return results, nextCursor, nil
}

// GetServer implements Repository.GetServer
func (r *MemoryRepository) GetServer(id string) (*types.ServerJSON, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	
	server, exists := r.servers[id]
	if !exists {
		return nil, errors.New("server not found")
	}
	
	return server, nil
}

// CreateServer implements Repository.CreateServer
func (r *MemoryRepository) CreateServer(server *types.ServerJSON) (*types.ServerJSON, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	
	// Generate ID if not provided
	id := uuid.New().String()
	
	// Create metadata
	now := time.Now()
	server.Meta = &types.ServerMeta{
		Official: &types.RegistryExtensions{
			ID:          id,
			PublishedAt: now,
			UpdatedAt:   now,
			IsLatest:    true,
		},
	}
	
	// Store the server
	r.servers[id] = server
	r.order = append(r.order, id)
	
	return server, nil
}

// UpdateServer implements Repository.UpdateServer
func (r *MemoryRepository) UpdateServer(id string, server *types.ServerJSON) (*types.ServerJSON, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	
	existing, exists := r.servers[id]
	if !exists {
		return nil, errors.New("server not found")
	}
	
	// Preserve metadata but update timestamp
	server.Meta = existing.Meta
	if server.Meta != nil && server.Meta.Official != nil {
		server.Meta.Official.UpdatedAt = time.Now()
	}
	
	r.servers[id] = server
	return server, nil
}

// DeleteServer implements Repository.DeleteServer
func (r *MemoryRepository) DeleteServer(id string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	
	if _, exists := r.servers[id]; !exists {
		return errors.New("server not found")
	}
	
	delete(r.servers, id)
	
	// Remove from order
	for i, orderId := range r.order {
		if orderId == id {
			r.order = append(r.order[:i], r.order[i+1:]...)
			break
		}
	}
	
	return nil
}

// SearchServers implements Repository.SearchServers
func (r *MemoryRepository) SearchServers(query string, limit int, cursor string) ([]types.ServerJSON, string, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	
	query = strings.ToLower(query)
	var matches []types.ServerJSON
	
	// Simple search by name and description
	for _, server := range r.servers {
		nameMatch := strings.Contains(strings.ToLower(server.Name), query)
		descMatch := strings.Contains(strings.ToLower(server.Description), query)
		
		if nameMatch || descMatch {
			matches = append(matches, *server)
		}
	}
	
	// Sort by name for consistency
	sort.Slice(matches, func(i, j int) bool {
		return matches[i].Name < matches[j].Name
	})
	
	// Apply pagination (simplified)
	startIdx := 0
	if cursor != "" {
		for i, server := range matches {
			if server.GetID() == cursor {
				startIdx = i + 1
				break
			}
		}
	}
	
	var results []types.ServerJSON
	var nextCursor string
	
	for i := startIdx; i < len(matches) && len(results) < limit; i++ {
		results = append(results, matches[i])
	}
	
	if startIdx+len(results) < len(matches) {
		nextCursor = results[len(results)-1].GetID()
	}
	
	return results, nextCursor, nil
}

// loadSampleData loads some sample servers for demonstration
func (r *MemoryRepository) loadSampleData() {
	sampleServers := []*types.ServerJSON{
		{
			Name:        "io.modelcontextprotocol/filesystem",
			Description: "Filesystem operations for MCP clients",
			Status:      types.StatusActive,
			Version:     "1.0.2",
			Repository: types.Repository{
				URL:    "https://github.com/modelcontextprotocol/servers",
				Source: "github",
				ID:     "modelcontextprotocol/servers",
			},
			WebsiteURL: "https://modelcontextprotocol.io",
			Packages: []types.Package{
				{
					RegistryType: "npm",
					Identifier:   "@modelcontextprotocol/server-filesystem",
					Version:      "1.0.2",
					RunTimeHint:  "node",
				},
			},
		},
		{
			Name:        "io.modelcontextprotocol/slack",
			Description: "Slack integration server for MCP",
			Status:      types.StatusActive,
			Version:     "0.2.1",
			Repository: types.Repository{
				URL:    "https://github.com/modelcontextprotocol/servers",
				Source: "github",
				ID:     "modelcontextprotocol/servers",
			},
			Packages: []types.Package{
				{
					RegistryType: "npm",
					Identifier:   "@modelcontextprotocol/server-slack",
					Version:      "0.2.1",
					RunTimeHint:  "node",
				},
			},
		},
		{
			Name:        "io.modelcontextprotocol/github",
			Description: "GitHub API integration for MCP clients",
			Status:      types.StatusActive,
			Version:     "0.4.0",
			Repository: types.Repository{
				URL:    "https://github.com/modelcontextprotocol/servers",
				Source: "github",
				ID:     "modelcontextprotocol/servers",
			},
			Packages: []types.Package{
				{
					RegistryType: "npm",
					Identifier:   "@modelcontextprotocol/server-github",
					Version:      "0.4.0",
					RunTimeHint:  "node",
				},
			},
		},
	}
	
	for _, server := range sampleServers {
		r.CreateServer(server)
	}
}