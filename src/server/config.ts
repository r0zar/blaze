import 'dotenv/config';

export interface ServerConfig {
    privateKey: string | undefined;
}

export const config: ServerConfig = {
    privateKey: process.env.PRIVATE_KEY
}; 