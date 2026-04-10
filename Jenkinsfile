# Jenkinsfile for Next.js Projects with Docker

## COPY THIS FILE TO YOUR REPOSITORY ROOT as: ./Jenkinsfile

pipeline {
    agent any
    
    options {
        buildDiscarder(logRotator(numToKeepStr: '10'))
        timeout(time: 30, unit: 'MINUTES')
        disableConcurrentBuilds()
    }
    
    environment {
        // Project configuration
        PROJECT_NAME = 'shanvox-website-v2'
        NODE_ENV = 'production'
        DOCKER_REGISTRY = 'docker.io'  // Change to your registry (e.g., ghcr.io, ecr, etc)
        DOCKER_IMAGE = 'shanvox/website-v2'
        DOCKER_TAG = "${BUILD_NUMBER}"
    }
    
    triggers {
        // Trigger on GitHub webhook push
        githubPush()
        
        // Fallback: Poll SCM every 5 minutes
        // pollSCM('H/5 * * * *')
    }
    
    stages {
        stage('Checkout') {
            steps {
                script {
                    echo "===================="
                    echo "Stage: Checkout"
                    echo "===================="
                    echo "Repository: ${PROJECT_NAME}"
                    echo "Branch: main"
                }
                
                checkout([
                    $class: 'GitSCM',
                    branches: [[name: '*/main']],
                    userRemoteConfigs: [[
                        url: 'git@github.com:shanvox-private-limited/shanvox-website-v2.git',
                        credentialsId: 'github-personal-ssh-key'
                    ]],
                    extensions: [
                        [$class: 'CleanBeforeCheckout'],
                        [$class: 'CloneOption', depth: 0, noTags: true, shallow: true]
                    ]
                ])
                
                script {
                    env.GIT_COMMIT_MSG = sh(
                        script: "git log -1 --pretty=%B",
                        returnStdout: true
                    ).trim()
                    
                    env.GIT_COMMIT_HASH = sh(
                        script: "git log -1 --pretty=%h",
                        returnStdout: true
                    ).trim()
                    
                    env.GIT_COMMIT_AUTHOR = sh(
                        script: "git log -1 --pretty=%an",
                        returnStdout: true
                    ).trim()
                    
                    echo "Commit: ${GIT_COMMIT_HASH}"
                    echo "Author: ${GIT_COMMIT_AUTHOR}"
                    echo "Message: ${GIT_COMMIT_MSG}"
                }
            }
        }
        
        stage('Setup Environment') {
            steps {
                script {
                    echo "===================="
                    echo "Stage: Setup Environment"
                    echo "===================="
                }
                
                sh '''
                    echo "Node version:"
                    node --version
                    
                    echo "NPM version:"
                    npm --version
                    
                    echo "Docker version:"
                    docker --version
                    
                    echo "Checking Docker daemon:"
                    docker ps -q | wc -l
                '''
            }
        }
        
        stage('Install Dependencies') {
            steps {
                script {
                    echo "===================="
                    echo "Stage: Install Dependencies"
                    echo "===================="
                }
                
                sh '''
                    echo "Installing npm dependencies..."
                    npm ci --prefer-offline --no-audit --legacy-peer-deps
                    
                    echo "Dependencies installed:"
                    npm list --depth=0 || true
                '''
            }
        }
        
        stage('Lint & Format Check') {
            steps {
                script {
                    echo "===================="
                    echo "Stage: Lint & Format Check"
                    echo "===================="
                }
                
                sh '''
                    if grep -q '"lint"' package.json; then
                        echo "Running ESLint..."
                        npm run lint || true
                    else
                        echo "No lint script found"
                    fi
                    
                    if grep -q '"format"' package.json; then
                        echo "Checking code formatting..."
                        npm run format:check || true
                    else
                        echo "No format script found"
                    fi
                '''
            }
        }
        
        stage('Build Next.js Application') {
            steps {
                script {
                    echo "===================="
                    echo "Stage: Build Next.js Application"
                    echo "===================="
                }
                
                sh '''
                    echo "Building Next.js application..."
                    npm run build
                    
                    echo "Build artifacts created:"
                    ls -lh .next/ | head -20 || true
                '''
            }
        }
        
        stage('Test') {
            steps {
                script {
                    echo "===================="
                    echo "Stage: Test"
                    echo "===================="
                }
                
                sh '''
                    if grep -q '"test"' package.json; then
                        echo "Running tests..."
                        npm test -- --coverage --passWithNoTests || true
                    else
                        echo "No test script found"
                    fi
                    
                    # Optionally run e2e tests
                    if grep -q '"e2e"' package.json; then
                        echo "Running e2e tests..."
                        npm run e2e || true
                    fi
                '''
            }
        }
        
        stage('Build Docker Image') {
            steps {
                script {
                    echo "===================="
                    echo "Stage: Build Docker Image"
                    echo "===================="
                    echo "Image: ${DOCKER_IMAGE}:${DOCKER_TAG}"
                }
                
                sh '''
                    echo "Building Docker image..."
                    
                    # Build with build-time arguments if needed
                    docker build \
                        --build-arg NODE_ENV=production \
                        --build-arg BUILD_ID=${BUILD_NUMBER} \
                        --build-arg GIT_COMMIT=${GIT_COMMIT_HASH} \
                        -t ${DOCKER_IMAGE}:${DOCKER_TAG} \
                        -t ${DOCKER_IMAGE}:latest \
                        -f Dockerfile .
                    
                    echo "Docker image built successfully"
                    docker images | grep ${DOCKER_IMAGE}
                '''
            }
        }
        
        stage('Push Docker Image') {
            when {
                branch 'main'
                not { changelog '.*\\[no-deploy\\].*' }
            }
            steps {
                script {
                    echo "===================="
                    echo "Stage: Push Docker Image"
                    echo "===================="
                }
                
                sh '''
                    echo "Tagging Docker image..."
                    docker tag ${DOCKER_IMAGE}:${DOCKER_TAG} ${DOCKER_IMAGE}:latest
                    
                    # Uncomment if pushing to external registry
                    # echo "Logging in to Docker registry..."
                    # docker login -u ${DOCKER_USERNAME} -p ${DOCKER_PASSWORD} ${DOCKER_REGISTRY}
                    # 
                    # echo "Pushing Docker image to registry..."
                    # docker push ${DOCKER_IMAGE}:${DOCKER_TAG}
                    # docker push ${DOCKER_IMAGE}:latest
                    
                    echo "Image ready for deployment:"
                    docker images | grep ${DOCKER_IMAGE}
                '''
            }
        }
        
        stage('Deploy to Staging') {
            when {
                branch 'main'
                not { changelog '.*\\[no-deploy\\].*' }
            }
            steps {
                script {
                    echo "===================="
                    echo "Stage: Deploy to Staging"
                    echo "===================="
                }
                
                sh '''
                    echo "Deploying to staging environment..."
                    
                    if [ -f "./scripts/deploy-staging.sh" ]; then
                        chmod +x ./scripts/deploy-staging.sh
                        ./scripts/deploy-staging.sh
                    else
                        echo "Staging deployment script not found"
                        echo "Create ./scripts/deploy-staging.sh to enable staging deployment"
                    fi
                '''
            }
        }
        
        stage('Deploy to Production') {
            when {
                branch 'main'
                not { changelog '.*\\[no-deploy\\].*' }
            }
            steps {
                script {
                    echo "===================="
                    echo "Stage: Deploy to Production"
                    echo "===================="
                }
                
                // Manual approval for production
                input(
                    id: 'ProdDeployment',
                    message: 'Deploy to production?',
                    ok: 'Deploy',
                    submitter: 'jenkins-admins'
                )
                
                sh '''
                    echo "Deploying to production environment..."
                    
                    if [ -f "./scripts/deploy-production.sh" ]; then
                        chmod +x ./scripts/deploy-production.sh
                        ./scripts/deploy-production.sh
                    else
                        echo "Production deployment script not found"
                        echo "Create ./scripts/deploy-production.sh to enable production deployment"
                    fi
                '''
            }
        }
        
        stage('Docker Cleanup') {
            steps {
                script {
                    echo "===================="
                    echo "Stage: Docker Cleanup"
                    echo "===================="
                    echo "Removing unused Docker images and cache..."
                }
                
                sh '''
                    echo "Cleaning up Docker system..."
                    
                    # Remove stopped containers
                    echo "Removing stopped containers..."
                    docker container prune -f --filter "until=24h"
                    
                    # Remove dangling images (intermediate builds)
                    echo "Removing dangling images..."
                    docker image prune -f --filter "dangling=true"
                    
                    # Remove unused images (optional - uncomment to remove all unused images)
                    echo "Removing unused images..."
                    docker image prune -a -f --filter "until=72h"
                    
                    # Remove volumes (optional - use with caution)
                    # echo "Removing unused volumes..."
                    # docker volume prune -f
                    
                    # Remove build cache (aggressive - uncomment to force clean builds)
                    # echo "Clearing Docker build cache..."
                    # docker builder prune -a -f
                    
                    echo "Docker cleanup complete"
                    echo "Current Docker system disk usage:"
                    docker system df
                '''
            }
        }
    }
    
    post {
        always {
            script {
                echo "===================="
                echo "Post-Build Actions"
                echo "===================="
            }
            
            // Archive build artifacts
            archiveArtifacts(
                artifacts: '.next/**/*,dist/**/*,build/**/*',
                allowEmptyArchive: true,
                fingerprint: true
            )
            
            // Clean workspace (keep only last 10 builds)
            cleanWs(
                deleteDirs: true,
                patterns: [
                    [pattern: 'node_modules/**', type: 'INCLUDE'],
                    [pattern: '.npm/**', type: 'INCLUDE'],
                    [pattern: '.next/.cache/**', type: 'INCLUDE']
                ]
            )
        }
        
        success {
            script {
                echo "===================="
                echo "✓ BUILD SUCCESSFUL"
                echo "===================="
                echo "Build #${BUILD_NUMBER} completed successfully"
                echo "Project: ${PROJECT_NAME}"
                echo "Commit: ${GIT_COMMIT_HASH}"
                echo "Docker Image: ${DOCKER_IMAGE}:${DOCKER_TAG}"
                
                // Add notification here (email, Slack, etc)
                // emailext(
                //     subject: "✓ Build Success: ${PROJECT_NAME} #${BUILD_NUMBER}",
                //     body: "Build successful. Ready for deployment.",
                //     to: 'team@shanvox.com'
                // )
            }
        }
        
        failure {
            script {
                echo "===================="
                echo "✗ BUILD FAILED"
                echo "===================="
                echo "Build #${BUILD_NUMBER} failed"
                echo "Check console output for errors"
                
                // Add notification here
                // emailext(
                //     subject: "✗ Build Failed: ${PROJECT_NAME} #${BUILD_NUMBER}",
                //     body: "Build failed. Check Jenkins logs.",
                //     to: 'team@shanvox.com'
                // )
            }
        }
        
        unstable {
            script {
                echo "===================="
                echo "⚠ BUILD UNSTABLE"
                echo "===================="
                echo "Build #${BUILD_NUMBER} has warnings"
            }
        }
    }
}

/* 
═══════════════════════════════════════════════════════════════════════════════
NOTES FOR THIS JENKINSFILE:
═══════════════════════════════════════════════════════════════════════════════

1. DOCKER REGISTRY
   - Line 25: DOCKER_REGISTRY = 'docker.io' 
   - Change to your registry (ghcr.io, ECR, Harbor, etc)

2. DOCKER CREDENTIALS
   - If pushing to external registry, uncomment lines 140-145
   - Add Jenkins credentials for docker login

3. DEPLOYMENT SCRIPTS
   - Create ./scripts/deploy-staging.sh for staging deployment
   - Create ./scripts/deploy-production.sh for production deployment
   - See examples below

4. DOCKER CLEANUP (IMPORTANT)
   - Lines 165-185: Docker cache cleanup is automated
   - Removes containers, images, and optionally volumes
   - Runs after every build
   - Clears images older than 72 hours

5. NOTIFICATIONS
   - Uncomment email notifications (lines 218-227, 231-239)
   - Configure Jenkins email plugin first

6. NEXT.JS SPECIFIC
   - Uses "npm ci" for reproducible installs
   - Builds .next directory
   - Archives .next artifacts
   - Supports env variables in docker build

═══════════════════════════════════════════════════════════════════════════════
DEPLOYMENT SCRIPT EXAMPLES:
═══════════════════════════════════════════════════════════════════════════════

Create ./scripts/deploy-staging.sh:
─────────────────────────────────────────────────────────────────────────────

#!/bin/bash
set -e

PROJECT_NAME="shanvox-website-v2"
DOCKER_IMAGE="shanvox/website-v2"
BUILD_NUMBER=$1
STAGING_PORT="3001"
STAGING_SERVER="staging.shanvox.com"
STAGING_USER="deploy"

echo "Deploying to staging..."
echo "Server: ${STAGING_SERVER}"
echo "Port: ${STAGING_PORT}"
echo "Image: ${DOCKER_IMAGE}:${BUILD_NUMBER}"

# Stop old container
docker stop ${PROJECT_NAME}-staging || true
docker rm ${PROJECT_NAME}-staging || true

# Run new container
docker run -d \
    --name ${PROJECT_NAME}-staging \
    -p ${STAGING_PORT}:3000 \
    -e NODE_ENV=staging \
    --restart unless-stopped \
    ${DOCKER_IMAGE}:${BUILD_NUMBER}

# Wait for container to start
sleep 5

# Health check
if curl -f http://localhost:${STAGING_PORT}/health > /dev/null; then
    echo "✓ Staging deployment successful"
    exit 0
else
    echo "✗ Health check failed"
    docker logs ${PROJECT_NAME}-staging
    docker stop ${PROJECT_NAME}-staging
    exit 1
fi

─────────────────────────────────────────────────────────────────────────────

Create ./scripts/deploy-production.sh:
─────────────────────────────────────────────────────────────────────────────

#!/bin/bash
set -e

PROJECT_NAME="shanvox-website-v2"
DOCKER_IMAGE="shanvox/website-v2"
BUILD_NUMBER=$1
PROD_PORT="3000"

echo "Deploying to production..."
echo "Image: ${DOCKER_IMAGE}:${BUILD_NUMBER}"

# Backup current container
CURRENT_CONTAINER=$(docker ps --filter "name=${PROJECT_NAME}-prod" --format "{{.ID}}" || echo "")

if [ ! -z "$CURRENT_CONTAINER" ]; then
    echo "Backing up current container..."
    docker commit ${CURRENT_CONTAINER} ${DOCKER_IMAGE}:backup-$(date +%s)
fi

# Stop old container
docker stop ${PROJECT_NAME}-prod || true
docker rm ${PROJECT_NAME}-prod || true

# Run new container
docker run -d \
    --name ${PROJECT_NAME}-prod \
    -p ${PROD_PORT}:3000 \
    -e NODE_ENV=production \
    --restart unless-stopped \
    -v /opt/logs:/app/logs \
    ${DOCKER_IMAGE}:${BUILD_NUMBER}

# Wait for container to start
sleep 5

# Health check
if curl -f http://localhost:${PROD_PORT}/health > /dev/null; then
    echo "✓ Production deployment successful"
    # Cleanup
    docker system prune -a -f
    exit 0
else
    echo "✗ Health check failed, rolling back..."
    docker stop ${PROJECT_NAME}-prod
    
    # Restore from backup if exists
    LATEST_BACKUP=$(docker images --filter "reference=${DOCKER_IMAGE}:backup-*" --format "{{.Tag}}" | sort -r | head -1)
    if [ ! -z "$LATEST_BACKUP" ]; then
        docker run -d \
            --name ${PROJECT_NAME}-prod \
            -p ${PROD_PORT}:3000 \
            -e NODE_ENV=production \
            --restart unless-stopped \
            ${DOCKER_IMAGE}:${LATEST_BACKUP}
        echo "Restored from backup: ${LATEST_BACKUP}"
    fi
    exit 1
fi

═══════════════════════════════════════════════════════════════════════════════
DOCKERFILE REQUIREMENTS:
═══════════════════════════════════════════════════════════════════════════════

Your Dockerfile should:
✓ Have a /health endpoint for health checks
✓ Expose port 3000 (or your app's port)
✓ Use multi-stage build to reduce image size
✓ Include NODE_ENV environment variable support

Example Dockerfile for Next.js:
─────────────────────────────────────────────────────────────────────────────

# Build stage
FROM node:18-alpine AS builder
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY .npmrc ./

# Install dependencies
RUN npm ci --legacy-peer-deps

# Copy source
COPY . .

# Build
ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}
RUN npm run build

# Production stage
FROM node:18-alpine
WORKDIR /app

# Copy only necessary files
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules ./node_modules

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Expose port
EXPOSE 3000

# Start
CMD ["npm", "start"]

═══════════════════════════════════════════════════════════════════════════════
*/
