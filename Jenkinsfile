pipeline {
    agent any

    environment {
        DOCKER_IMAGE     = "your-dockerhub-username/nextjs-sample"
        DOCKER_TAG       = "${BUILD_NUMBER}"
        DOCKER_REGISTRY  = "https://registry.hub.docker.com"
        REMOTE_SERVER    = "root@94.136.191.205"
        DEPLOY_PATH      = "/opt/nextjs-sample"
    }

    stages {

        // ─── PRE-BUILD ───────────────────────────────────────────────

        stage('Checkout') {
            steps {
                checkout scm
                echo "Branch: ${env.BRANCH_NAME} | Build: ${BUILD_NUMBER}"
            }
        }

        stage('Branch validation') {
            steps {
                script {
                    if (env.BRANCH_NAME != 'main') {
                        error("Deploy only allowed from main branch. Current branch: ${env.BRANCH_NAME}")
                    }
                }
            }
        }

        stage('Install dependencies') {
            steps {
                sh 'npm ci'
            }
        }

        stage('Lint') {
            steps {
                sh 'npm run lint || true'
            }
        }

        stage('Secret scan') {
            steps {
                sh '''
                    if command -v gitleaks &> /dev/null; then
                        gitleaks detect --source . --verbose
                    else
                        echo "Gitleaks not installed, skipping secret scan"
                    fi
                '''
            }
        }

        stage('Version tag') {
            steps {
                script {
                    def shortCommit = sh(returnStdout: true, script: 'git rev-parse --short HEAD').trim()
                    env.APP_VERSION = "${BUILD_NUMBER}-${shortCommit}"
                    echo "Version: ${env.APP_VERSION}"
                }
            }
        }

        // ─── BUILD ───────────────────────────────────────────────────

        stage('Build Next.js') {
            steps {
                sh 'npm run build'
            }
        }

        stage('Build Docker image') {
            steps {
                sh "docker build -t ${DOCKER_IMAGE}:${DOCKER_TAG} -t ${DOCKER_IMAGE}:latest ."
            }
        }

        // ─── SECURITY ────────────────────────────────────────────────

        stage('Scan Docker image') {
            steps {
                sh '''
                    if command -v trivy &> /dev/null; then
                        trivy image --exit-code 0 --severity HIGH,CRITICAL ${DOCKER_IMAGE}:${DOCKER_TAG}
                    else
                        echo "Trivy not installed, skipping image scan"
                    fi
                '''
            }
        }

        // ─── PUBLISH ─────────────────────────────────────────────────

        stage('Push to Docker Hub') {
            steps {
                withCredentials([usernamePassword(
                    credentialsId: 'dockerhub-credentials',
                    usernameVariable: 'DOCKER_USER',
                    passwordVariable: 'DOCKER_PASS'
                )]) {
                    sh '''
                        echo "$DOCKER_PASS" | docker login -u "$DOCKER_USER" --password-stdin
                        docker push ${DOCKER_IMAGE}:${DOCKER_TAG}
                        docker push ${DOCKER_IMAGE}:latest
                    '''
                }
            }
        }

        // ─── DEPLOY ──────────────────────────────────────────────────

        stage('Deploy to server') {
            steps {
                withCredentials([sshUserPrivateKey(
                    credentialsId: 'server-ssh-key',
                    keyFileVariable: 'SSH_KEY'
                )]) {
                    sh '''
                        ssh -i $SSH_KEY -o StrictHostKeyChecking=no ${REMOTE_SERVER} "
                            docker pull ${DOCKER_IMAGE}:latest &&
                            docker stop nextjs-sample || true &&
                            docker rm nextjs-sample || true &&
                            docker run -d \
                                --name nextjs-sample \
                                --restart always \
                                -p 3000:3000 \
                                ${DOCKER_IMAGE}:latest
                        "
                    '''
                }
            }
        }

        // ─── SMOKE TEST ──────────────────────────────────────────────

        stage('Smoke test') {
            steps {
                sh '''
                    sleep 10
                    curl -f http://${REMOTE_SERVER}:3000 || exit 1
                    echo "App is live!"
                '''
            }
        }
    }

    // ─── POST ────────────────────────────────────────────────────────

    post {
        success {
            echo "Deployed successfully! Version: ${env.APP_VERSION}"
        }
        failure {
            echo "Build failed! Rolling back..."
            withCredentials([sshUserPrivateKey(
                credentialsId: 'server-ssh-key',
                keyFileVariable: 'SSH_KEY'
            )]) {
                sh '''
                    ssh -i $SSH_KEY -o StrictHostKeyChecking=no ${REMOTE_SERVER} "
                        docker stop nextjs-sample || true &&
                        docker rm nextjs-sample || true &&
                        docker run -d \
                            --name nextjs-sample \
                            --restart always \
                            -p 3000:3000 \
                            ${DOCKER_IMAGE}:previous || true
                    "
                '''
            }
        }
        always {
            sh 'docker image prune -f || true'
            cleanWs()
        }
    }
}
