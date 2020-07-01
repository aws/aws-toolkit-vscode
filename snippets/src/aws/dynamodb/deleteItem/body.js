// To delete an item
// This example deletes an item from the Music table.
const dynamoDb = new AWS.DynamoDB({ apiVersion: "2012-08-10" });

try {
  const response = await dynamoDb
    .deleteItem(
      /*$0*/ {
        Key: {
          Artist: {
            S: "No One You Know"
          },
          SongTitle: {
            S: "Scared of My Shadow"
          }
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
