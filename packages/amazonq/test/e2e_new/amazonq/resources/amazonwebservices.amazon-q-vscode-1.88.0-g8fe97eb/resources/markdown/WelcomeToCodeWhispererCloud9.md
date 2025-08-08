## How to use Amazon CodeWhisperer

Welcome to the Amazon CodeWhisperer preview. CodeWhisperer uses machine learning to generate code suggestions from the existing code and comments in your IDE. Supported languages include: **Java, Python, and JavaScript**.

### Accepting or rejecting the recommendation

You should automatically see a CodeWhisperer code suggestion in a pop-up as you type. Use the **TAB or Enter key to accept** the Code suggestion. If you don’t like the suggestions you see, simply keep typing (or hit the **ESC** key). The suggestions will go away and CodeWhisperer will generate new one at a later point based on the additional context.

### Requesting suggestions manually

You can also request a suggestion at any time. Use **Option - C** on Mac and **ALT - C** on Windows. Once you receive the suggestions, use TAB to accept and the arrow keys to navigate.

### How to get the best recommendations

-   More context = better recommendations. You will see better recommendations when your current file has more existing code.
-   Write more comments and be more descriptive. “Function to upload a file to S3” will get better results than “Upload a file.”
-   Specify the libraries you prefer by inserting import statements.
-   Use descriptive names for variable and functions. A function called “upload_file_to_S3” will get better results than a function called “file_upload.”
-   Break down complex tasks into smaller tasks and write descriptive comments.

### How to provide feedback

CodeWhisperer is in preview. Let us know what your think by sharing feedback (using the AWS Toolkit feedback button) or reaching out to codewhisperer@amazon.com.
