export class AdapterError extends Error {
  constructor(message, { service, code } = {}) {
    super(message);
    this.name = 'AdapterError';
    this.service = service;
    this.code = code;
  }
}
export const READ_FAILED = "Couldn't read this message. Try again.";
export const notConfigured = (serviceName) => new AdapterError(`Not configured: add ${serviceName} key`, { code: 'not_configured', service: serviceName });
