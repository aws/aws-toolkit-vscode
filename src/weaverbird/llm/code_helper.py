import logging
import os
from pathlib import Path

def build_code_context(workspace: str):
    code_context = "\nThe existing code files are below:\n"
    
    # Build code context
    for root, dirs, files in os.walk(workspace):
        for filename in files:
            file_path = os.path.join(root, filename)
            code_context += f"--BEGIN-FILE: {file_path}\n"
            with open(file_path) as file:
                # Read line-by-line because .readlines() results in weird '\n' formatting
                file_content_lines = file.read().splitlines()
                for file_line in file_content_lines:
                    code_context += f"{file_line}\n"
            code_context += f"--END-FILE--\n\n"
    
    return code_context
        
def write_llm_completion_to_files(claude_response, logger: logging.Logger):
    file_path = ""
    file_content = ""
    
    response_split = claude_response.split("\n")
    for line in response_split:
        if "--BEGIN-FILE" in line:
            file_path = line.split(": ")[1].strip()
            # Reset file content for a new file
            file_content = ""
        elif "--END-FILE--" in line:
            # Write to the file
            logger.debug(f"New file created: {file_path}")
            
            # Create the directory if it doesn't exist
            p = Path(file_path)
            dir = str(p.parent)
            if not os.path.exists(dir):
                logger.debug(f"Creating directory {dir}")
                os.mkdir(dir)
            
            with open(file_path, "w") as file:
                file.write(file_content)
        else:
            # This is a file content line
            file_content += f"{line}\n"
            
def push_code(commit_message):
    # os.system("git add .")
    os.system(f"git commit -m \"{commit_message}\"")
    os.system("git push")