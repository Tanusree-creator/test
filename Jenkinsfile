pipeline {
    agent any

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Install') {
            steps {
                sh 'npm install'
            }
        }

        stage('Lint') {
            steps {
                sh 'npm run lint || true'
            }
        }

        stage('Build') {
            steps {
                sh 'npm run build'
            }
        }

        stage('Deploy') {
            steps {
                sh '''
                    rsync -avz .next/ user@your-server:/opt/nextjs-sample/.next/
                    rsync -avz public/ user@your-server:/opt/nextjs-sample/public/
                    rsync -avz package.json user@your-server:/opt/nextjs-sample/
                    ssh user@your-server "cd /opt/nextjs-sample && npm install --production && pm2 restart nextjs-sample || pm2 start npm --name nextjs-sample -- start"
                '''
            }
        }
    }

    post {
        success {
            echo 'Deployed successfully!'
        }
        failure {
            echo 'Build failed!'
        }
    }
}
