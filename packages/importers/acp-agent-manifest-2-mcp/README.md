# ACP agent manifest parser

Parses `application/acp-agent-manifest+json` source artifacts into one ARD
`agent` capability plus each declared `skill` capability. The parser preserves
the raw manifest and skill slices for downstream indexing.

`http`, `slim`, and `acp` describe AGNTCY invocation transports. They do not
select QuickDeployAI's existing `acp` capability type, which belongs to Zed's
Agent Client Protocol.
