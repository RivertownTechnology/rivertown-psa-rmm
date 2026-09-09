import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { createHandler } from './bridge.mjs';

// AWS SDK v3 is included in the Node.js 22 Lambda runtime. No access keys needed.
const secrets = new SecretsManagerClient({ maxAttempts: 1 });
export const handler = createHandler({
  readSecret: async (secretId, signal) => {
    const response = await secrets.send(new GetSecretValueCommand({ SecretId: secretId }), { abortSignal: signal });
    return response.SecretString;
  },
});
