# OpenAI Language Model Provider

This extension provides OpenAI language models (GPT-4o, GPT-4o Mini, GPT-4 Turbo, GPT-3.5 Turbo) for use with VS Code's chat and agent features.

## Configuration

1. Open the Language Models management UI:
   - Command Palette (`Cmd/Ctrl + Shift + P`) → "Manage Language Models"
   - Or use the command: `workbench.action.chat.manage`

2. Click "Add Models..." and select "OpenAI"

3. Configure your OpenAI settings:
   - **API Key**: Your OpenAI API key (stored securely)
   - **API Base URL**: Optional, defaults to `https://api.openai.com`

Alternatively, you can manually edit `chatLanguageModels.json`:

```json
[
	{
		"vendor": "openai",
		"name": "OpenAI",
		"apiKey": "YOUR_API_KEY_HERE",
		"apiBaseUrl": "https://api.openai.com"
	}
]
```

## Usage

Once configured, OpenAI models will be available in:
- Chat interface
- Agent sessions
- Execution mode
- Any feature that uses language models

Select the model from the model picker in the chat interface.

## Supported Models

- **GPT-4o** - Latest GPT-4 model with improved performance
- **GPT-4o Mini** - Faster and more cost-effective GPT-4 variant
- **GPT-4 Turbo** - Previous GPT-4 model
- **GPT-3.5 Turbo** - Fast and efficient model

## Development

```bash
cd extensions/openai-language-model
npm install
npm run compile
```

## License

MIT
