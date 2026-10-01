FROM public.ecr.aws/lambda/python:3.14

COPY app.py requirements.txt ./

RUN python3.14 -m pip install -r requirements.txt

# Command can be overwritten by providing a different command in the template directly.
CMD ["app.lambda_handler"]