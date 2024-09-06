/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export const awsEventSchemaContent = `{
    "openapi" : "3.0.0",
    "info" : {
      "version" : "1.0.0",
      "title" : "EC2InstanceStateChangeNotification"
    },
    "paths" : { },
    "components" : {
      "schemas" : {
        "AWSEvent" : {
          "type" : "object",
          "required" : [ "detail-type", "resources", "id", "source", "time", "detail", "region", "version", "account" ],
          "x-amazon-events-detail-type" : "EC2 Instance State-change Notification",
          "x-amazon-events-source" : "aws.ec2",
          "properties" : {
            "detail" : {
              "$ref" : "#/components/schemas/EC2InstanceStateChangeNotification"
            },
            "detail-type" : {
              "type" : "string"
            },
            "resources" : {
              "type" : "array",
              "items" : {
                "type" : "string"
              }
            },
            "id" : {
              "type" : "string"
            },
            "source" : {
              "type" : "string"
            },
            "time" : {
              "type" : "string",
              "format" : "date-time"
            },
            "region" : {
              "type" : "string",
              "enum" : [ "ap-south-1", "eu-west-3", "eu-north-1", "eu-west-2", "eu-west-1", "ap-northeast-2", "ap-northeast-1", "me-south-1", "sa-east-1", "ca-central-1", "ap-east-1", "cn-north-1", "us-gov-west-1", "ap-southeast-1", "ap-southeast-2", "eu-central-1", "us-east-1", "us-west-1", "cn-northwest-1", "us-west-2" ]
            },
            "version" : {
              "type" : "string"
            },
            "account" : {
              "type" : "string"
            }
          }
        },
        "EC2InstanceStateChangeNotification" : {
          "type" : "object",
          "required" : [ "instance-id", "state" ],
          "properties" : {
            "instance-id" : {
              "type" : "string"
            },
            "state" : {
              "type" : "string"
            }
          }
        }
      }
    }
  }`

export const partnerSchemaContent = `{
    "openapi": "3.0.0",
    "info": {
      "version": "1.0.0",
      "title": "TicketCreated"
    },
    "paths": {},
    "components": {
      "schemas": {
        "AWSEvent" : {
          "type" : "object",
          "required" : [ "detail-type", "resources", "id", "source", "time", "detail", "region", "version", "account" ],
          "x-amazon-events-detail-type" : "MongoDB Trigger for my_store.reviews",
          "x-amazon-events-source" : "aws.partner-mongodb.com",
          "properties" : {
            "detail" : {
              "$ref" : "#/components/schemas/aws.partner/mongodb.com/Ticket.Created"
            },
            "detail-type" : {
              "type" : "string"
            },
            "resources" : {
              "type" : "array",
              "items" : {
                "type" : "string"
              }
            },
            "id" : {
              "type" : "string"
            },
            "source" : {
              "type" : "string"
            },
            "time" : {
              "type" : "string",
              "format" : "date-time"
            },
            "region" : {
              "type" : "string",
              "enum" : [ "ap-south-1", "eu-west-3", "eu-north-1", "eu-west-2", "eu-west-1", "ap-northeast-2", "ap-northeast-1", "me-south-1", "sa-east-1", "ca-central-1", "ap-east-1", "cn-north-1", "us-gov-west-1", "ap-southeast-1", "ap-southeast-2", "eu-central-1", "us-east-1", "us-west-1", "cn-northwest-1", "us-west-2" ]
            },
            "version" : {
              "type" : "string"
            },
            "account" : {
              "type" : "string"
            }
          }
        },
        "TicketCreated" : {
          "type" : "object",
          "required" : [ "creator", "department", "ticketId" ],
          "properties" : {
            "creator" : {
              "type" : "string"
            },
            "department" : {
              "type" : "string"
            },
            "ticketId" : {
              "type" : "string"
            }
          }
        }
      }
    }
  }`

export const customerUploadedSchema = `{
    "openapi": "3.0.0",
    "info": {
      "version": "1.0.0",
      "title": "SomeAwesomeSchema"
    },
    "paths": {},
    "components": {
      "schemas": {
        "Some Awesome Schema" : {
          "type" : "object",
          "required" : [ "foo", "bar", "baz" ],
          "properties" : {
            "foo" : {
              "type" : "string"
            },
            "bar" : {
              "type" : "string"
            },
            "baz" : {
              "type" : "string"
            }
          }
        }
      }
    }
  }`

export const customerUploadedSchemaMultipleTypes = `{
    "openapi": "3.0.0",
    "info": {
      "version": "1.0.0",
      "title": "SomeAwesomeSchema"
    },
    "paths": {},
    "components": {
      "schemas": {
        "Some/Awesome/Schema.Object.1" : {
          "type" : "object",
          "required" : [ "foo", "bar", "baz" ],
          "properties" : {
            "foo" : {
              "type" : "string"
            },
            "bar" : {
              "type" : "string"
            },
            "baz" : {
              "type" : "string"
            }
          }
        },
        "Some/Awesome/Schema.Object$2" : {
          "type" : "object",
          "required" : [ "foo", "bar", "baz" ],
          "properties" : {
            "foo" : {
              "type" : "string"
            },
            "bar" : {
              "type" : "string"
            },
            "baz" : {
              "type" : "string"
            }
          }
        }
      }
    }
  }`
