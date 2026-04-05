const { spawn } = require('child_process');

function safeJsonParse(value, defaultValue) {
  if (!value) return defaultValue;
  try {
    return JSON.parse(value);
  } catch (e) {
    console.error('JSON parse error:', e.message);
    return defaultValue;
  }
}

function buildCommand(runtime, command) {
  if (runtime === 'python') {
    return { cmd: 'python3', args: ['-m', 'mcp', ...(safeJsonParse(command, []))] };
  }
  return { cmd: command, args: safeJsonParse(command, []) };
}

function executeStdioRequest(command, args, envVars, request, runtime = 'node') {
  return new Promise((resolve, reject) => {
    const argsArray = safeJsonParse(args, []);
    const envVarsObj = safeJsonParse(envVars, {});
    
    const fullEnv = { ...process.env, ...envVarsObj };
    
    let cmd = command;
    let cmdArgs = argsArray;
    
    if (runtime === 'python') {
      cmd = 'python3';
      cmdArgs = ['-m', 'mcp', ...argsArray];
    }
    
    const proc = spawn(cmd, cmdArgs, {
      env: fullEnv,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    let stdout = '';
    let stderr = '';
    
    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn process: ${err.message}`));
    });
    
    proc.on('close', (code) => {
      if (code !== 0 && stderr) {
        reject(new Error(`Process exited with code ${code}: ${stderr}`));
      }
    });
    
    proc.stdin.write(JSON.stringify(request) + '\n');
    
    setTimeout(() => {
      try {
        proc.kill();
      } catch (e) {}
      
      try {
        const lines = stdout.trim().split('\n');
        const lastLine = lines[lines.length - 1];
        
        if (!lastLine) {
          reject(new Error('No response from MCP server'));
          return;
        }
        
        const response = JSON.parse(lastLine);
        
        if (response.error) {
          reject(new Error(response.error.message || JSON.stringify(response.error)));
        } else {
          resolve(response.result || response);
        }
      } catch (e) {
        reject(new Error(`Failed to parse response: ${e.message}. Output: ${stdout}`));
      }
    }, 30000);
  });
}

async function getTools(command, args, envVars, runtime = 'node') {
  const request = {
    jsonrpc: '2.0',
    id: Date.now(),
    method: 'tools/list',
    params: {}
  };
  
  return executeStdioRequest(command, args, envVars, request, runtime);
}

async function callTool(command, args, envVars, toolName, toolArgs = {}, runtime = 'node') {
  const request = {
    jsonrpc: '2.0',
    id: Date.now(),
    method: 'tools/call',
    params: {
      name: toolName,
      arguments: toolArgs
    }
  };
  
  return executeStdioRequest(command, args, envVars, request, runtime);
}

function validateJsonRpcResponse(response) {
  if (!response) {
    throw new Error('Empty response');
  }
  
  if (response.jsonrpc !== '2.0') {
    throw new Error('Invalid JSON-RPC version');
  }
  
  if (!response.id) {
    throw new Error('Missing request ID');
  }
  
  if (response.error) {
    const err = response.error;
    throw new Error(err.message || err.code || JSON.stringify(err));
  }
  
  if (!response.result && !response.error) {
    throw new Error('Invalid response: missing result or error');
  }
  
  return true;
}

module.exports = {
  getTools,
  callTool,
  safeJsonParse,
  validateJsonRpcResponse,
  buildCommand
};