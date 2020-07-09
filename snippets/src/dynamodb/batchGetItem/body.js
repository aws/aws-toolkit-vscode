// To retrieve multiple items from a table
// This example reads multiple items from the Music table using a batch of three GetItem requests.  Only the AlbumTitle attribute is returned.
const dynamoDb = new AWS.DynamoDB({ apiVersion: "2012-08-10" });

try {
  const response = await dynamoDb
    .batchGetItem(
      /*$0*/ {
        RequestItems: {
          Music: {
            Keys: [
              {
                Artist: {
                  S: "No One You Know"
                },
                SongTitle: {
                  S: "Call Me Today"
                }
              },
              {
                Artist: {
                  S: "Acme Band"
                },
                SongTitle: {
                  S: "Happy Day"
                }
              },
              {
                Artist: {
                  S: "No One You Know"
                },
                SongTitle: {
                  S: "Scared of My Shadow"
                }
              }
            ],
            ProjectionExpression: "AlbumTitle"
          }
        }
      }
    )
    .promise();
  console.log(response); // successful response
} catch (err) {
  console.log(err, err.stack); // an error occurred
  throw err;
}
