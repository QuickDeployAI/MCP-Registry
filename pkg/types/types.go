package types

import (
	"time"
)

// Status represents the lifecycle status of a server
type Status string

const (
	StatusActive     Status = "active"
	StatusDeprecated Status = "deprecated"
	StatusDeleted    Status = "deleted"
)

// Format represents the input format type
type Format string

const (
	FormatString   Format = "string"
	FormatNumber   Format = "number"
	FormatBoolean  Format = "boolean"
	FormatFilePath Format = "file_path"
)

// ArgumentType represents the type of argument
type ArgumentType string

const (
	ArgumentTypePositional ArgumentType = "positional"
	ArgumentTypeNamed      ArgumentType = "named"
)

// Transport represents transport configuration with optional URL templating
type Transport struct {
	Type    string          `json:"type"`
	URL     string          `json:"url,omitempty"`
	Headers []KeyValueInput `json:"headers,omitempty"`
}

// Package represents a package configuration
type Package struct {
	// RegistryType indicates how to download packages (e.g., "npm", "pypi", "oci", "mcpb")
	RegistryType string `json:"registry_type" validate:"required"`
	// RegistryBaseURL is the base URL of the package registry
	RegistryBaseURL string `json:"registry_base_url,omitempty"`
	// Identifier is the package identifier - either a package name (for registries) or URL (for direct downloads)
	Identifier           string          `json:"identifier" validate:"required"`
	Version              string          `json:"version" validate:"required"`
	FileSHA256           string          `json:"file_sha256,omitempty"`
	RunTimeHint          string          `json:"runtime_hint,omitempty"`
	Transport            Transport       `json:"transport,omitempty"`
	RuntimeArguments     []Argument      `json:"runtime_arguments,omitempty"`
	PackageArguments     []Argument      `json:"package_arguments,omitempty"`
	EnvironmentVariables []KeyValueInput `json:"environment_variables,omitempty"`
}

// Repository represents a source code repository as defined in the spec
type Repository struct {
	URL       string `json:"url"`
	Source    string `json:"source"`
	ID        string `json:"id,omitempty"`
	Subfolder string `json:"subfolder,omitempty"`
}

// Input represents a configuration input
type Input struct {
	Description string   `json:"description,omitempty"`
	IsRequired  bool     `json:"is_required,omitempty"`
	Format      Format   `json:"format,omitempty"`
	Value       string   `json:"value,omitempty"`
	IsSecret    bool     `json:"is_secret,omitempty"`
	Default     string   `json:"default,omitempty"`
	Choices     []string `json:"choices,omitempty"`
}

// InputWithVariables represents an input that can contain variables
type InputWithVariables struct {
	Input     `json:",inline"`
	Variables map[string]Input `json:"variables,omitempty"`
}

// KeyValueInput represents a named input with variables
type KeyValueInput struct {
	InputWithVariables `json:",inline"`
	Name               string `json:"name"`
}

// Argument defines a type that can be either a PositionalArgument or a NamedArgument
type Argument struct {
	InputWithVariables `json:",inline"`
	Type               ArgumentType `json:"type"`
	Name               string       `json:"name,omitempty"`
	IsRepeated         bool         `json:"is_repeated,omitempty"`
	ValueHint          string       `json:"value_hint,omitempty"`
}

// RegistryExtensions represents registry-generated metadata
type RegistryExtensions struct {
	ID          string    `json:"id"`
	PublishedAt time.Time `json:"published_at"`
	UpdatedAt   time.Time `json:"updated_at,omitempty"`
	IsLatest    bool      `json:"is_latest"`
}

// ServerMeta represents the structured metadata with known extension fields
type ServerMeta struct {
	Official         *RegistryExtensions    `json:"io.modelcontextprotocol.registry/official,omitempty"`
	PublisherProvided map[string]interface{} `json:"io.modelcontextprotocol.registry/publisher-provided,omitempty"`
}

// ServerJSON represents complete server information as defined in the MCP spec, with extension support
type ServerJSON struct {
	Schema        string      `json:"$schema,omitempty"`
	Name          string      `json:"name" validate:"required,min=1,max=200"`
	Description   string      `json:"description" validate:"required,min=1,max=100"`
	Status        Status      `json:"status,omitempty"`
	Repository    Repository  `json:"repository,omitempty"`
	Version       string      `json:"version"`
	WebsiteURL    string      `json:"website_url,omitempty"`
	Packages      []Package   `json:"packages,omitempty"`
	Remotes       []Transport `json:"remotes,omitempty"`
	Meta          *ServerMeta `json:"_meta,omitempty"`
}

// GetID returns the server ID from metadata
func (s *ServerJSON) GetID() string {
	if s.Meta != nil && s.Meta.Official != nil {
		return s.Meta.Official.ID
	}
	return ""
}

// ServerListResponse represents the paginated server list response
type ServerListResponse struct {
	Servers  []ServerJSON `json:"servers"`
	Metadata Metadata     `json:"metadata"`
}

// Metadata represents pagination metadata
type Metadata struct {
	NextCursor string `json:"next_cursor,omitempty"`
	Count      int    `json:"count"`
}

// ErrorResponse represents an API error response
type ErrorResponse struct {
	Error   string `json:"error"`
	Message string `json:"message,omitempty"`
	Code    int    `json:"code,omitempty"`
}

// PublishRequest represents a server publish request
type PublishRequest struct {
	ServerJSON
	// Optional authentication token
	Token string `json:"token,omitempty"`
}

// HealthResponse represents a health check response
type HealthResponse struct {
	Status  string `json:"status"`
	Version string `json:"version,omitempty"`
	Time    string `json:"time"`
}