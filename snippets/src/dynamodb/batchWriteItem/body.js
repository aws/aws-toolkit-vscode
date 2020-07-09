// To add multiple items to a table
// This example adds three new items to the Music table using a batch of three PutItem requests.
const dynamoDb = new AWS.DynamoDB({ apiVersion: "2012-08-10" });

try {
  const response = await dynamoDb
    .batchWriteItem(
      /*$0*/ {
        RequestItems: {
          Music: [
            {
              PutRequest: {
                Item: {
                  AlbumTitle: {
                    S: "Somewhat Famous"
                  },
                  Artist: {
                    S: "No One You Know"
                  },
                  SongTitle: {
                    S: "Call Me Today"
                  }
                }
              }
            },
            {
              PutRequest: {
                Item: {
                  AlbumTitle: {
                    S: "Songs About Life"
                  },
                  Artist: {
                    S: "Acme Band"
                  },
                  SongTitle: {
                    S: "Happy Day"
                  }
                }
              }
            },
            {
              PutRequest: {
                Item: {
                  AlbumTitle: {
                    S: "Blue Sky Blues"
                  },
                  Artist: {
                    S: "No One You Know"
                  },
                  SongTitle: {
                    S: "Scared of My Shadow"
                  }
                }
              }
            }
          ]
        }
      }
    )
    .promise();
  console.log(response); // successful response
} catch (err) {
  console.log(err, err.stack); // an error occurred
  throw err;
}
