FROM public.ecr.aws/lambda/python:3.6

COPY app.py requirements.txt ./

RUN python3.6 -m pip install -r requirements.txt

CMD ["app.lambda_handler"]
