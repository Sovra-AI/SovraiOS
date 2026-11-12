import errorResponse from './fixtures/error-response.json';
import helloRequest from './fixtures/hello-request.json';
import inspectRequest from './fixtures/inspect-request.json';
import pairRequest from './fixtures/pair-request.json';
import readyResponse from './fixtures/ready-response.json';
import { type RemoteRequest, decodeResponse, parseInspect, validateUiRequest } from '../wire';

describe('desktop wire fixtures', () => {
  it('requests built by the client match the desktop fixtures exactly', () => {
    const hello: RemoteRequest = { version: 1, operation: { op: 'hello' } };
    const pair: RemoteRequest = { version: 1, operation: { op: 'pair', secret: '02'.repeat(32), name: 'My phone' } };
    const inspect: RemoteRequest = {
      version: 1,
      operation: {
        op: 'control',
        generation: '01'.repeat(32),
        session: '03'.repeat(32),
        sequence: 1,
        revision: null,
        request: { action: 'inspect' },
      },
    };
    // Key order matters for byte-equality with what the Rust side serializes.
    expect(JSON.stringify(hello)).toBe(JSON.stringify(helloRequest));
    expect(JSON.stringify(pair)).toBe(JSON.stringify(pairRequest));
    expect(JSON.stringify(inspect)).toBe(JSON.stringify(inspectRequest));
  });

  it('decodes desktop replies strictly', () => {
    expect(decodeResponse(JSON.stringify(readyResponse))).toEqual(readyResponse);
    expect(decodeResponse(JSON.stringify(errorResponse))).toEqual(errorResponse);
    expect(decodeResponse('{"status":"paired"}')).toEqual({ status: 'paired' });
    expect(decodeResponse('{"status":"error","code":"made_up","message":"x"}')).toBeNull();
    expect(decodeResponse('{"status":"ready","version":1}')).toBeNull();
    expect(decodeResponse('not json')).toBeNull();
  });

  it('parses inspect payloads and drops malformed elements', () => {
    const parsed = parseInspect({
      elements: [
        { target: 't1', label: 'Send', role: 'Button', visible: true, disabled: null, bounds: { x: 1, y: 2, width: 3, height: 4 } },
        { target: 't2', label: 'broken' },
      ],
      total: 2,
      truncated: false,
      input_values: 'omitted for privacy',
      appearance: 'light',
      interface_scale_percent: 125,
      revision: 'abc',
    });
    expect(parsed?.elements.map((e) => e.target)).toEqual(['t1']);
    expect(parsed?.appearance).toBe('light');
    expect(parseInspect({ elements: [] })).toBeNull();
  });

  it('validates input like UiRequest::validate', () => {
    expect(validateUiRequest({ action: 'click', target: '' })).not.toBeNull();
    expect(validateUiRequest({ action: 'scroll', target: 'x', lines: 101 })).not.toBeNull();
    expect(validateUiRequest({ action: 'type', text: 'a'.repeat(4097) })).not.toBeNull();
    expect(validateUiRequest({ action: 'type', text: 'é'.repeat(2049) })).not.toBeNull();
    expect(validateUiRequest({ action: 'key', key: '' })).not.toBeNull();
    expect(validateUiRequest({ action: 'type', text: 'hello world' })).toBeNull();
  });
});
