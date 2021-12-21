import http from "http";

export const sumReducer = (previous: number, current : number) : number => {
    if (current) {
        return previous + current
    }
    return previous
}

export const fetchUrl = (url: string): Promise<string> => {
    return new Promise<string>(
        (onSuccess, onError) => {
            const options: http.RequestOptions = {
                timeout: 15 * 1000,
            }

            let data = ""
            const request = http.request(url, options, (response) => {
                response.setEncoding('utf8');
                response.on('data', (dataChunk) => {
                    data += dataChunk
                })
                response.on('end', () => {
                    onSuccess(data)
                })
            })

            request.on('error', (error) => {
                onError(error)
            })

            request.end()
        }
    );
}
