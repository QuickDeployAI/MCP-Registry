package service

import (
	"testing"

	"github.com/QuickDeployAI/MCP-Registry/internal/repository"
	"github.com/QuickDeployAI/MCP-Registry/pkg/types"
	"github.com/stretchr/testify/assert"
)

func TestRegistryService_ListServers(t *testing.T) {
	// Setup
	repo := repository.NewMemoryRepository()
	service := NewRegistryService(repo)
	
	// Test
	response, err := service.ListServers(10, "")
	
	// Assert
	assert.NoError(t, err)
	assert.NotNil(t, response)
	assert.GreaterOrEqual(t, len(response.Servers), 1) // Should have sample data
	assert.Equal(t, len(response.Servers), response.Metadata.Count)
}

func TestRegistryService_PublishServer(t *testing.T) {
	// Setup
	repo := repository.NewMemoryRepository()
	service := NewRegistryService(repo)
	
	request := &types.PublishRequest{
		ServerJSON: types.ServerJSON{
			Name:        "test.example/test-server",
			Description: "A test server",
			Version:     "1.0.0",
			Status:      types.StatusActive,
			Packages: []types.Package{
				{
					RegistryType: "npm",
					Identifier:   "@test/test-server",
					Version:      "1.0.0",
				},
			},
		},
	}
	
	// Test
	server, err := service.PublishServer(request)
	
	// Assert
	assert.NoError(t, err)
	assert.NotNil(t, server)
	assert.Equal(t, request.Name, server.Name)
	assert.NotEmpty(t, server.GetID())
}

func TestRegistryService_SearchServers(t *testing.T) {
	// Setup
	repo := repository.NewMemoryRepository()
	service := NewRegistryService(repo)
	
	// Test
	response, err := service.SearchServers("filesystem", 10, "")
	
	// Assert
	assert.NoError(t, err)
	assert.NotNil(t, response)
	assert.GreaterOrEqual(t, len(response.Servers), 1) // Should find filesystem server
}

func TestRegistryService_ValidateServer(t *testing.T) {
	service := NewRegistryService(repository.NewMemoryRepository())
	
	tests := []struct {
		name    string
		server  types.ServerJSON
		wantErr bool
	}{
		{
			name: "valid server",
			server: types.ServerJSON{
				Name:        "test.example/valid",
				Description: "A valid test server",
				Version:     "1.0.0",
			},
			wantErr: false,
		},
		{
			name: "missing name",
			server: types.ServerJSON{
				Description: "Missing name",
				Version:     "1.0.0",
			},
			wantErr: true,
		},
		{
			name: "missing description",
			server: types.ServerJSON{
				Name:    "test.example/missing-desc",
				Version: "1.0.0",
			},
			wantErr: true,
		},
		{
			name: "missing version",
			server: types.ServerJSON{
				Name:        "test.example/missing-version",
				Description: "Missing version",
			},
			wantErr: true,
		},
	}
	
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := service.validateServer(&tt.server)
			if tt.wantErr {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
			}
		})
	}
}