// Speech adapter. Interface: transcribe(media) -> Promise<{ text, language }>
import { AdapterError, READ_FAILED, notConfigured } from './errors.js';
import { configuredKeys } from '../config.js';

export const mockSpeech = {
  name: 'mock',
  async transcribe(media, { fail = false } = {}) {
    if (fail) throw new AdapterError(READ_FAILED, { service: 'Speech-to-text', code: 'simulated_failure' });
    if (!media || !media.mock_transcript) throw new AdapterError(READ_FAILED, { service: 'Speech-to-text', code: 'no_audio' });
    return { text: media.mock_transcript, language: 'hi-en' };
  },
};

export const liveSpeech = {
  name: 'live',
  async transcribe() {
    // The real version posts the audio to a server function that calls Sarvam AI or OpenAI.
    if (!configuredKeys.SPEECH_API_KEY) throw notConfigured('Speech-to-text');
    throw new AdapterError('The live speech adapter is not part of the demo build.', { service: 'Speech-to-text', code: 'not_built' });
  },
};
