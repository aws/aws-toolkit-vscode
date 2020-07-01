// To read an item from a table
// This example retrieves an item from the Music table. The table has a partition key and a sort key (Artist and SongTitle), so you must specify both of these attributes.
const dynamoDb = new AWS.DynamoDB({ apiVersion: "2012-08-10" });

try {
  const response = await dynamoDb
    .getItem(
      /*$0*/ {
        Key: {
          Artist: {
            S: "Acme Band"
          },
          SongTitle: {
            S: "Happy Day"
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
