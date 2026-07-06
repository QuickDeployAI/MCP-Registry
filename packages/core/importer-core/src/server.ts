export interface ServerTransport {
  close?: () => Promise<void> | void;
}

export interface ConnectableServer<TTransport extends ServerTransport = ServerTransport> {
  connect(transport: TTransport): Promise<void>;
}

export async function startServer<TTransport extends ServerTransport>(
  server: ConnectableServer<TTransport>,
  transport: TTransport,
): Promise<void> {
  await server.connect(transport);
}
