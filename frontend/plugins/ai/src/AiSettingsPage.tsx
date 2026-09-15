import { useEffect, useState } from 'react';
import { useAiApi } from './AiPluginProvider';

export function AiSettingsPage() {
  const api = useAiApi();
  const [provider, setProvider] = useState('');
  const [model, setModel] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [configured, setConfigured] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void api.getSettings().then((settings) => {
      if (!active) return;
      setProvider(settings.provider ?? '');
      setModel(settings.model ?? '');
      setEndpoint(settings.endpoint ?? '');
      setConfigured(settings.apiKeyConfigured);
    }).catch((cause: unknown) => {
      if (active) setMessage(cause instanceof Error ? cause.message : 'Could not load AI settings.');
    });
    return () => { active = false; };
  }, [api]);

  const save = async () => {
    setMessage(null);
    try {
      const settings = await api.saveSettings({
        provider: provider || null,
        model: model || null,
        endpoint: endpoint || null,
        ...(apiKey ? { apiKey } : {}),
      });
      setApiKey('');
      setConfigured(settings.apiKeyConfigured);
      setMessage('AI settings saved.');
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Could not save AI settings.');
    }
  };

  const clearKey = async () => {
    setMessage(null);
    try {
      const settings = await api.saveSettings({ clearApiKey: true });
      setConfigured(settings.apiKeyConfigured);
      setMessage('API key cleared.');
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Could not clear API key.');
    }
  };

  return (
    <section aria-labelledby="ai-settings-title">
      <h1 id="ai-settings-title">AI writing</h1>
      <p>Enter the provider adapter id and connection details supplied by your installation. This plugin does not offer a provider preset.</p>
      <label>Provider adapter <input value={provider} onChange={(event) => setProvider(event.target.value)} /></label>
      <label>Model <input value={model} onChange={(event) => setModel(event.target.value)} /></label>
      <label>Endpoint <input value={endpoint} onChange={(event) => setEndpoint(event.target.value)} /></label>
      <label>API key <input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} autoComplete="new-password" /></label>
      <p>{configured ? 'An API key is configured.' : 'No API key configured.'}</p>
      <button type="button" onClick={() => void save()}>Save</button>
      {configured ? <button type="button" onClick={() => void clearKey()}>Clear API key</button> : null}
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}
