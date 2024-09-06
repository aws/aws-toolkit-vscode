FROM public.ecr.aws/lambda/python:3.7

COPY app.py requirements.txt ./

RUN python3.7 -m pip install -r requirements.txt

# Command can be overwritten by providing a different command in the template directly.
CMD ["app.lambda_handler"]