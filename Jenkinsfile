pipeline {
  agent any

  environment {
    DEPLOY_DIR = '/var/jenkins_home/deployments/test'
    SERVICE    = 'test-app'
  }

  stages {

    stage('Checkout') {
      steps {
        git credentialsId: 'github-ssh-key',
            url: 'git@github.com:Tanusree-creator/test.git',
            branch: 'main'
      }
    }

    stage('Install') {
      steps {
        sh 'npm ci'
      }
    }

    stage('Build') {
      steps {
        sh 'npm run build'
      }
    }

    stage('Deploy') {
      when {
        branch 'main'
      }
      steps {
        sh '''
          rsync -av --delete \
            --exclude='.git' \
            --exclude='node_modules' \
            ${WORKSPACE}/ ${DEPLOY_DIR}/
        '''
      }
    }
  }

  post {
    success {
      echo "Deployed successfully — build #${env.BUILD_NUMBER}"
    }
    failure {
      echo "Build #${env.BUILD_NUMBER} failed"
    }
  }
}

