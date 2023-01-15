# frozen_string_literal: true

require 'aws-sdk-s3'
require 'aws-sdk-dynamodb'
require 'json'

def handler(event:, _context:)
  logger = Logger.new($stdout)
  logger.info('## Received New Message from API##')
  logger.info(event)

  request = JSON.parse(event['body'])

  # validate_params(name, email, message)

  response = upload_images_to_s3(images)
  create_pet_in_dynamodb
  success
rescue StandardError => e
  error(e)
end

private

def upload_images_to_s3(images)
  client = Aws::S3::Client.new

end

# rubocop:disable Metrics/MethodLength
def success
  {
    body: JSON.generate(message: 'Podopieczny został stworzony.'),
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Headers': 'Origin,Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
      'Access-Control-Allow-Methods': 'GET,OPTIONS,POST',
      'Access-Control-Allow-Origin': '*'
    },
    isBase64Encoded: false
  }
end
# rubocop:enable Metrics/MethodLength

# rubocop:disable Metrics/MethodLength
def error(error)
  {
    body: JSON.generate({ error: error.message }),
    statusCode: 400,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Headers': 'Origin,Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
      'Access-Control-Allow-Methods': 'GET,OPTIONS,POST',
      'Access-Control-Allow-Origin': '*'
    },
    isBase64Encoded: false
  }
end
# rubocop:enable Metrics/MethodLength
