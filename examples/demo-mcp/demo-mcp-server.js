const express = require('express');

const app = express();
app.use(express.json());

const tools = [
  {
    name: 'echo',
    description: 'Echo back the input text',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text to echo back' }
      },
      required: ['text']
    }
  },
  {
    name: 'add',
    description: 'Add two numbers',
    inputSchema: {
      type: 'object',
      properties: {
        a: { type: 'number', description: 'First number' },
        b: { type: 'number', description: 'Second number' }
      },
      required: ['a', 'b']
    }
  },
  {
    name: 'get_time',
    description: 'Get the current time',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'get_weather',
    description: 'Get weather for a city',
    inputSchema: {
      type: 'object',
      properties: {
        city: { type: 'string', description: 'City name' }
      },
      required: ['city']
    }
  }
];

app.get('/tools', (req, res) => {
  res.json({ tools });
});

app.post('/execute', (req, res) => {
  const { toolName, params } = req.body;
  
  let result;
  switch (toolName) {
    case 'echo':
      result = { echo: params.text };
      break;
    case 'add':
      result = { sum: params.a + params.b };
      break;
    case 'get_time':
      result = { time: new Date().toISOString() };
      break;
    case 'get_weather':
      result = { 
        city: params.city, 
        temperature: Math.floor(Math.random() * 30) + 10,
        condition: ['Sunny', 'Cloudy', 'Rainy'][Math.floor(Math.random() * 3)]
      };
      break;
    default:
      return res.status(404).json({ error: 'Tool not found' });
  }
  
  res.json({ success: true, result });
});

app.get('/hello', (req, res) => {
  res.json({ message: 'Demo MCP Server', version: '1.0.0' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Demo MCP Server running on http://localhost:${PORT}`);
  console.log(`Tools endpoint: http://localhost:${PORT}/tools`);
  console.log(`Execute endpoint: http://localhost:${PORT}/execute`);
});
