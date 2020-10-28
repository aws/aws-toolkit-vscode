// To create a table
// This example creates a table named Music.
const dynamoDb = new AWS.DynamoDB({ apiVersion: "2012-08-10" });

try {
  const response = await dynamoDb
    .createTable(
      /*$0*/ {
        AttributeDefinitions: [
          {
            AttributeName: "Artist",
            AttributeType: "S"
          },
          {
            AttributeName: "SongTitle",
            AttributeType: "S"
          }
        ],
        KeySchema: [
          {
            AttributeName: "Artist",
            KeyType: "HASH"
          },
          {
            AttributeName: "SongTitle",
            KeyType: "RANGE"
          }
        ],
        ProvisionedThroughput: {
          ReadCapacityUnits: 5,
          WriteCapacityUnits: 5
        },
        TableName: "Music"
      }
    )
    .promise();
  console.log(response); // successful response
} catch (err) {
  console.log(err, err.stack); // an error occurred
  throw err;
}
