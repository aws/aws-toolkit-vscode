## How to Use Amazon CodeWhisperer

Welcome to the Amazon CodeWhisperer preview! CodeWhisperer uses machine learning to generate code suggestions
from the existing code and comments in your IDE. Supported languages include: **Java, Python, and JavaScript**.

### TAB. Left Arrow. Right Arrow. That’s all!

You should automatically see inline code suggestions. Use the **TAB key to accept** a suggestion. CodeWhisperer may
provide multiple suggestions to choose from, use **[left arrow] and [right arrow] to navigate** between suggestions.

That’s all you need to know. If you don’t like the suggestions you see, simply keep typing (or hit ESC key).
The suggestions will go away and CodeWhisperer will generate new ones at a later point based on the additional context.

### Requesting Suggestions Manually

You can also request a suggestion at any time, use **Option C** on Mac and **ALT C** on Windows. Once you receive
the suggestions use TAB to accept and the Arrow keys to navigate.

### How to get the best recommendations

-   More context = better recommendations. You will see better recommendations when your current file has more
    existing code.

-   Write more comments and be more descriptive. “Function to upload a file to S3” will get better results than
    “Upload a file.”

-   Try to specify the libraries you prefer by inserting import statements.

-   Use descriptive names for variable and functions. A function called “upload_file_to_S3” will get better results
    than a function called “file_upload”

-   Break down complex tasks into smaller tasks and write descriptive comments.

### How to provide feedback

CodeWhisperer is in preview, let us know what your think by sharing feedback (using the AWS Toolkit
feedback button) or reaching out to [codewhisperer@amazon.com](mailto:codewhisperer@amazon.com) .
