FROM golang:1.24

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN go build -o medical_records

EXPOSE 8084

CMD ["./medical_records"]
