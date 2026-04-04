const axios = require('axios');

class JenkinsParser {
  constructor(baseUrl, auth = null) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.auth = auth;
  }

  getAuthHeaders() {
    if (!this.auth || this.auth.type === 'none') return {};
    
    const headers = {};
    
    if (this.auth.type === 'basic') {
      const username = this.auth.credentials?.username || this.auth.username;
      const password = this.auth.credentials?.password || this.auth.password;
      if (username && password) {
        const credentials = Buffer.from(`${username}:${password}`).toString('base64');
        headers['Authorization'] = `Basic ${credentials}`;
      }
    } else if (this.auth.type === 'bearer') {
      const token = this.auth.credentials?.token || this.auth.token;
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    } else if (this.auth.type === 'apiKey') {
      const apiKey = this.auth.credentials?.apiKey || this.auth.apiKey;
      const apiKeyName = this.auth.credentials?.apiKeyName || this.auth.apiKeyName || 'X-API-Key';
      if (apiKey) {
        if (this.auth.credentials?.apiKeyIn === 'header' || this.auth.apiKeyIn === 'header') {
          headers[apiKeyName] = apiKey;
        }
      }
    }
    
    return headers;
  }

  async discover(path = '/api/json') {
    try {
      const instanceInfo = await this.getInstanceInfo(path);
      const jobs = await this.getJobs();
      
      const endpoints = [];
      
      // Add instance info endpoint
      endpoints.push({
        path: '/api/json',
        method: 'GET',
        operationId: 'getInstanceInfo',
        summary: 'Get Jenkins Instance Info',
        description: 'Returns information about the Jenkins instance',
        params: [],
        body: null,
        tags: ['instance']
      });
      
      // Add job discovery endpoint
      endpoints.push({
        path: '/job',
        method: 'GET',
        operationId: 'listJobs',
        summary: 'List All Jobs',
        description: 'Returns a list of all jobs on the Jenkins instance',
        params: [],
        body: null,
        tags: ['jobs']
      });
      
      // Add endpoints for each job
      for (const job of jobs) {
        const jobName = job.name;
        const sanitizedJobName = jobName.replace(/[^a-zA-Z0-9_-]/g, '_');
        
        // Job info endpoint
        endpoints.push({
          path: `/job/${encodeURIComponent(jobName)}`,
          method: 'GET',
          operationId: `getJob_${sanitizedJobName}`,
          summary: `Get Job: ${jobName}`,
          description: `Get information about the ${jobName} job`,
          params: [],
          body: null,
          tags: ['job', 'info']
        });
        
        // Job builds endpoint
        endpoints.push({
          path: `/job/${encodeURIComponent(jobName)}/builds`,
          method: 'GET',
          operationId: `getJobBuilds_${sanitizedJobName}`,
          summary: `Get Builds for Job: ${jobName}`,
          description: `Get build history for the ${jobName} job`,
          params: [],
          body: null,
          tags: ['job', 'builds']
        });
        
        // Job last build endpoint
        endpoints.push({
          path: `/job/${encodeURIComponent(jobName)}/lastBuild`,
          method: 'GET',
          operationId: `getJobLastBuild_${sanitizedJobName}`,
          summary: `Get Last Build for Job: ${jobName}`,
          description: `Get the last build information for the ${jobName} job`,
          params: [],
          body: null,
          tags: ['job', 'build']
        });
        
        // Job last build console endpoint
        endpoints.push({
          path: `/job/${encodeURIComponent(jobName)}/lastBuild/consoleText`,
          method: 'GET',
          operationId: `getJobLastBuildConsole_${sanitizedJobName}`,
          summary: `Get Last Build Console for Job: ${jobName}`,
          description: `Get the console output of the last build for the ${jobName} job`,
          params: [],
          body: null,
          tags: ['job', 'build', 'console']
        });
        
        // Job build endpoint (POST to trigger build)
        endpoints.push({
          path: `/job/${encodeURIComponent(jobName)}/build`,
          method: 'POST',
          operationId: `buildJob_${sanitizedJobName}`,
          summary: `Build Job: ${jobName}`,
          description: `Trigger a build of the ${jobName} job`,
          params: [],
          body: null,
          tags: ['job', 'build', 'action']
        });
        
        // Job parameters endpoint (if job has parameters)
        if (job.actions && Array.isArray(job.actions)) {
          for (const action of job.actions) {
            if (action._class && action._class.includes('ParametersDefinitionProperty')) {
              endpoints.push({
                path: `/job/${encodeURIComponent(jobName)}/buildWithParameters`,
                method: 'POST',
                operationId: `buildJobWithParams_${sanitizedJobName}`,
                summary: `Build Job with Parameters: ${jobName}`,
                description: `Trigger a build of the ${jobName} job with parameters`,
                params: [],
                body: { type: 'object', properties: {} }, // Would need to extract actual parameters
                tags: ['job', 'build', 'parameters', 'action']
              });
              break;
            }
          }
        }
      }
      
      return {
        info: {
          title: instanceInfo.displayName || 'Jenkins Instance',
          version: '1.0.0',
          description: instanceInfo.description || 'Discovered from Jenkins REST API'
        },
        baseUrl: this.baseUrl,
        endpoints,
        total: endpoints.length
      };
    } catch (error) {
      throw new Error(`Failed to discover Jenkins API: ${error.message}`);
    }
  }

  async getInstanceInfo(path = '/api/json') {
    const response = await axios.get(`${this.baseUrl}${path}`, {
      headers: this.getAuthHeaders(),
      timeout: 10000
    });
    return response.data;
  }

  async getJobs() {
    const response = await axios.get(`${this.baseUrl}/api/json?tree=jobs[name,color,actions[_class,parameters]]`, {
      headers: this.getAuthHeaders(),
      timeout: 10000
    });
    return response.data.jobs || [];
  }
}

module.exports = JenkinsParser;