#!/usr/bin/env node

/**
 * Test: Verify PostgreSQL deployment includes initContainer to fix hostPath volume permissions.
 * This test ensures that on Docker Desktop Kubernetes (and other hostPath setups),
 * the PostgreSQL pod can initialize by pre-chowning the data volume.
 */

const { execSync } = require('child_process');

function fail(message) {
  console.error(`❌ ${message}`);
  process.exit(1);
}

function pass(message) {
  console.log(`✅ ${message}`);
  process.exit(0);
}

try {
  // Render the Helm chart with minimal values to satisfy requirements
  const cmd = [
    'helm template',
    'optio ./helm/optio',
    '--show-only templates/postgres.yaml',
    '--set encryption.key=test',
    '--set postgresql.auth.password=test',
    '--set auth.disabled=true'
  ].join(' ');
  
  const output = execSync(cmd, { encoding: 'utf-8' });
  
  // Find the PostgreSQL deployment
  const docs = output.split('---').filter(doc => doc.trim().length > 0);
  const postgresDeployments = docs.filter(doc => 
    doc.includes('kind: Deployment') && 
    doc.includes('app: postgres')
  );
  
  if (postgresDeployments.length === 0) {
    fail('PostgreSQL deployment not found in Helm template');
  }
  
  const deployment = postgresDeployments[0];
  
  // Check for initContainer
  if (!deployment.includes('initContainers:')) {
    fail('initContainers not configured in PostgreSQL deployment');
  }
  
  // Check for chown command with 999:999 somewhere in deployment (should be in initContainer)
  if (!deployment.includes('chown') || !deployment.includes('999:999')) {
    fail('initContainer does not run chown command with UID 999 and GID 999');
  }
  
   // Check that initContainer runs as root (necessary for chown)
   if (!deployment.includes('runAsUser: 0')) {
     fail('initContainer does not run as root (runAsUser: 0 missing)');
   }
   
   // Extract initContainer name for a nice success message
   const nameMatch = deployment.match(/-\s*name:\s*(\S+)/);
   const name = nameMatch ? nameMatch[1] : 'fix-volume-permissions';
   pass(`initContainer '${name}' present with proper chown and root securityContext`);
  
} catch (error) {
  if (error.stderr && error.stderr.includes('Error')) {
    fail(`Helm command failed: ${error.stderr.trim()}`);
  } else if (error.code === 1) {
    // execSync throws with non-zero exit code, already handled above
    fail('Test failed');
  } else {
    fail(`Unexpected error: ${error.message}`);
  }
}
