export const handlerTwoFoldersDeep = async (event, context) => {
    console.log('hello world')

    const response = {
      statusCode: 200,
      body: JSON.stringify({
        message: 'hello world',
      })
    };

    return response;
  };
  
