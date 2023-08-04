import logging
import os
import sys
import anthropic
from pathlib import Path
from code_helper import build_code_context, write_llm_completion_to_files, push_code

# https://docs.anthropic.com/claude/reference/complete_post
llm_defaults = {
    "model": "claude-v1.3-100k",
    "temperature": 0,  # No variance
    "max_tokens_to_sample": 10_000
}

anthropic_api_key_env = "ANTHROPIC_API_KEY"

context_file_path = f"{Path(__file__).parent.resolve()}/context.txt"

claude_prompt_instructions = f"""Generate code only if necessary. For any code generated, they need to be accompanied with thorough test cases that tests the correctness of the code.
You will be provided the contents of the existing code. 
The contents of each file begin with "--BEGIN-FILE:" followed by the file path.
The contents of each file end with "--END-FILE--".
Use the same delimiters for each new file as in the input you are given below.
In your response, each line of code must be on a newline.
Unless explicitly requested, do not remove existing code that is unrelated to the change.
Remember to try to reuse the existing code and follow the existing patterns and logic organizations, and separation of concerns that exist in the code when adding new changes.
"""

claude_interactive_break_word = "thanks"
claude_interactive_help_text = f"""
How can I help (type "{claude_interactive_break_word}" to exit)? """

# prompt_instructions = "You are a software engineer.\
#     \nYou receive one instruction at a time.\
#     \nYou are to follow the instruction by making changes to the codebase you are given.\
#     \nDetermine which files need to be modified and respond with the required changes\
#     \nYou will be provided the contents of some files.\
#     \nThe contents of each file begin with \"--BEGIN-FILE:\" followed by the file path.\
#     \nThe contents of each file end with \"--END-FILE--\".\
#     \nRespond with the new content of the files.\
#     \nUse the same delimiters for each file as in the input you are given below.\
#     \nIn your response, each line of code must be on a newline.\
#     \nDo not preface your response with anything.\
#     \n\nThe codebase files and content are below:\n\
# "

# \n--BEGIN-FILE: app.py\
#     \napp = cdk.App()\
#     \n--END-FILE--\n\n\

class Claude:
    anthropic_api_key = ""
    task_description = ""
    logger = None
    
    def __init__(self, logger: logging.Logger):
        if anthropic_api_key_env in os.environ:
            self.anthropic_api_key = os.environ.get(anthropic_api_key_env)
        else:
            raise Exception(f"The {anthropic_api_key_env} environment variable must be set") 

        self.logger = logger

        self.logger.debug(f"Claude config={str(llm_defaults)}")
        
    def talk_to_claude_non_interactive(self):
        self.task_description = os.environ.get("__DEV_ENVIRONMENT_ALIAS")
        final_prompt = self.__build_prompt(self.task_description)
        self.__talk_to_claude(final_prompt)
        
    def talk_to_claude_interactive(self):
        while True:
            user_input = input(claude_interactive_help_text)
            if user_input == claude_interactive_break_word:
                break
            elif user_input == "PR":
                pr_title = input("Pull request title: ")
                self.logger.debug(f"Creating a pull request with title \"{pr_title}\"...")
                push_code(pr_title)
                break
            
            history = ""
            if os.path.isfile(context_file_path):
                with open(context_file_path) as context_file:
                    context_lines = context_file.read().splitlines()
                    for context_line in context_lines:
                        history += f"{context_line}\n"

            user_prompt = self.__build_prompt(user_input)
            self.__talk_to_claude(history, user_prompt)

    def talk_to_claude_with_query(self, query: str, workspace: str):
        history = ""
        if os.path.isfile(context_file_path):
            with open(context_file_path) as context_file:
                context_lines = context_file.read().splitlines()
                for context_line in context_lines:
                    history += f"{context_line}\n"

        user_prompt = self.__build_prompt(query)
        self.__talk_to_claude(history, user_prompt, workspace)

    def __talk_to_claude(self, history, prompt_without_code_context, workspace="/projects/weaverbird-poc/src"):
        latest_code_context = build_code_context(workspace)
        prompt_for_claude = f"{history}{anthropic.HUMAN_PROMPT} {prompt_without_code_context}{latest_code_context}{anthropic.AI_PROMPT}"
        
        # https://github.com/anthropics/anthropic-sdk-python/blob/main/examples/basic_sync.py
        llm = anthropic.Client(self.anthropic_api_key)
        response = llm.completion(
            prompt=prompt_for_claude,
            stop_sequences=[anthropic.HUMAN_PROMPT],
            model=llm_defaults['model'],
            max_tokens_to_sample=llm_defaults['max_tokens_to_sample']
        )
        completion = response['completion']

        # Don't save the full code in the historical context, since the latest code will be provided each time
        prompt_to_save_in_context = f"{history}{anthropic.HUMAN_PROMPT} {prompt_without_code_context}{anthropic.AI_PROMPT}"
        self.__process_llm_completion(prompt_to_save_in_context, completion)
        
    def __build_prompt(self, user_prompt):
        return f"""
Now, respond to the following request: {user_prompt}.
{claude_prompt_instructions}
"""
    
    def __process_llm_completion(self, prompt, completion):
        # Use print here because we want to re-direct the output to stdout instead of stderr by default
        print(completion)
        write_llm_completion_to_files(completion, self.logger)
        self.__save_context(prompt, completion)
        self.__count_tokens(prompt, completion)
                
    def __save_context(self, prompt, completion):
        # TODO: change to append mode instead of overwrite
        with open(context_file_path, "w") as context_file:
            context_file.write(f"{prompt}\n\n")
            context_file.write(f"{completion}")
                
    def __count_tokens(self, prompt, completion):
        prompt_token_count = anthropic.count_tokens(prompt)
        completion_token_count = anthropic.count_tokens(completion)

        # Pricing: https://cdn2.assets-servd.host/anthropic-website/production/images/model_pricing_may2023.pdf
        prompt_cost = prompt_token_count * 0.00001102
        completion_cost = completion_token_count * 0.00003268

        self.logger.debug(f"""
Cost of interaction:
Prompt tokens={prompt_token_count}, cost=${prompt_cost}
Completion tokens={completion_token_count}, cost=${completion_cost}
""")


if __name__ == "__main__":
    interactive_mode = False
    query = ""
    workspace = ""
    if len(sys.argv) > 1 and sys.argv[1]=="--interactive":
        interactive_mode = True
    
    # TODO this should really be replaced by a better args parser
    if len(sys.argv) > 1 and sys.argv[1]=="--query":
        query = sys.argv[2]
        if query == "":
            raise ValueError("Must provide query argument when using query mode")

        if len(sys.argv) < 4 or not sys.argv[3]=="--workspace":
            raise ValueError("Must provide --workspace when using query mode")

        if len(sys.argv) < 5 or sys.argv[4] == "":
            raise ValueError("Must provide workspace argument when using query mode")

        workspace = sys.argv[4]          

    logging.basicConfig(
        # Extra output is disabled in query mode since we are directly consuming the output in VSCode and showing it in a chat interface
        # and we don't want to see things like cost of interactions, claude configs, etc
        level=logging.INFO if query != "" else logging.DEBUG,
        format="%(message)s"
    )
    logger = logging.getLogger()
    
    claude = Claude(logger)

    if interactive_mode:
        claude.talk_to_claude_interactive()
    elif query != "":
        claude.talk_to_claude_with_query(query, workspace)
    else:
        claude.talk_to_claude_non_interactive()