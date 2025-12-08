/**
 * JWT Sign tests
 *
 * @author gchq77703 []
 *
 * @copyright Crown Copyright 2018
 * @license Apache-2.0
 */
import TestRegister from "../../lib/TestRegister.mjs";

const inputObject = JSON.stringify({
    String: "SomeString",
    Number: 42,
    iat: 1
}, null, 4);

const hsKey = "secret_cat";
const rsKey = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDyctlheJSGFQM7
qbbQaG6xsPCkGmwUrfrKqs+yINpwbvIxtERM5Hy4d1zS+ZlH7Y1VQxDsr0PjXS8G
83dabeQ1Z59L+iuN6bb5xVFKBg0eT9zM2UJp6F0NZtP9iz8+ZlMhGAPqp7qhYO2o
iq6CqW+Z4/87wNL4KEFZTa9GRN0YAbJsRHfPRleJLfWm/9jc5dgyqz6HIEhuSd3k
HiG3A1HUp+ih+z3wwxHAgqle932sEHUSfKzK4Y1cKyn9ph8NUrZFHctGZpCjQa9t
6LEf/HafhbLn6ej5Aykfgm9Wzgfqy+WakmjUf33DB0BWpI2yefqmDa5iU+6rSlEx
3x7RSah5AgMBAAECggEAEozdy87Ia2lma81YlOHWrV8UzHOOlzb4GENhPJd1qzJb
8thgfPMjBVCxsB1DoHyhKpfE7t0aoEX4FAuzEz7S/hCRgERSCovKMZpqtbOYk5wH
8H8DjTunif/XAsBhnIZDAEZYf17pwVD7oiCJSWtKJA/NLq7aXX0kAd+XJHTep0hM
1JrXWQhBIlZeF7S5/u+MbkdAa+/9RnfEjojHxXA+Gyam4cPlrGI/2wCD/Q+o+dIp
irnUUlrhVrnkHbq10Rb2cHBcHt8ptr73Fn1tCgjXjUh10N/wbiQvDRgcS0GXcW+j
lrKIUWHhP/ihPEf/XNgl2W5HLoarGjU/AYcKThXM0QKBgQD77OJRAuUttz8dckdp
piFDdZ+kO+O6uav2g5VTJpdMeoQyhf5c8DFVUXtzcsKdAoCTIpKsTzxq5dR21qt/
NIPrqt48yMtK2FvwX9JnsnfxfmbLJH2vbGVML76dM36u3D+dCpjhiG+ULZeXwazO
5q0QQLvitTuvRWTEVtOGJmjd8QKBgQD2Xrnh7xwSzzvEJQfjcoyICPim2YbC5HU2
kHmt9j2SreKxgyvYOdKyCbT1P0GU4ZX9jMZ5CSd+2bO4b76+NVCRNgJXO5y15BVE
JY07o5oSph7A5Q9oQKMjIH/uoeb6gT3BhbAMo8STn8SP7yKPECJ4jkvFn6MX1Ott
950UwJiLCQKBgD+OldJGXrdX4c52BFo9FWtFg48VpPB440+ABu5BcC5VQoDUmUWt
O2UA95o6u6qM9Q8py8M5Ak8dyKpqoj2nbBjKtOK07cTmLNvJ8PVEa0o7z4c0n5jg
SfYcnYRfd3h6DHp8L/HGUBAcKICa1hQk0kilbEFX48TmRvPZy+euTQqhAoGAU/xE
t51wX4UfpaTOBJ43A+SzBwXeZ6/DuV8U69WmdcsrHUJO/v3vMlwWwQfYTm18WRvV
SMtzGE4Ucwo85tB775SOxbf/mw3upfV7KNqDmlng3/b2Ap8OPdpFYk70026dY8w0
EIr/ZyeutTZa/JQOfDRd5jeePHCL9UfU1480MSkCgYEAlTh/fDAqM+VHfPIFoK8l
AFyZhmq0TKHu6mZJ2FpBk3CtAnGzr89PE5orwHoq/wL/SxFXHRgbrLlRZ90VLc9x
Z+On217NUfJU1JjYnRiD15+aBVY5Ugf37e3Ee5vnbTTsqueZCvVfgIxoUDafv7vY
9AuB+29hLd8MMviwpCYpGPY=
-----END PRIVATE KEY-----`;
const esKey = `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgevZzL1gdAFr88hb2
OF/2NxApJCzGCEDdfSp6VQO30hyhRANCAAQRWz+jn65BtOMvdyHKcvjBeBSDZH2r
1RTwjmYSi9R/zpBnuQ4EiMnCqfMPWiZqB4QdbAd0E7oH50VpuZ1P087G
-----END PRIVATE KEY-----`;
const es384Key = `-----BEGIN EC PRIVATE KEY-----
MIGkAgEBBDB2eq4z/UorX0IukkdgAH5vLr66Q8+06vgDVTaE2p1ZdM1lnMXfGBvz
KWzPiuf+/dWgBwYFK4EEACKhZANiAARJxcS5o/sY6wUW5KcdKAWsgqbCcUcAka+f
fnm43upc4VGgGhDRq998avC8xTZSsqA2L7z06MphO4PzN+sf65vkj/fPxaV5YB1i
K1TjPI7x1UUbDa4pHs8xj84qf1lVuT4=
-----END EC PRIVATE KEY-----`;
const es512Key = `-----BEGIN EC PRIVATE KEY-----
MIHcAgEBBEIBZVfBFDDgWfEzaO7o3GpLbCH54YTHFZsNF1g2hemTjPIKv6AF5rmM
eKxdGJUrzXpdkY4KeNGtuL8cnxMX6r5tyz6gBwYFK4EEACOhgYkDgYYABAGouR/A
RFfidh4y53J09SAPUcByX7y818r4Vf2GETBM9Uw2VO00RRA8/M5U7ETnK8uRU1In
VD8MUd3qcnK2fQIe/AFrXgFjzA8ME9PgmyyswhA7jEWBEJGPtlZswFPu2f/8PsDz
wcAeCBEnjnCelgY9kb3yvk0nbSt+S7Qh5cvdGBGasg==
-----END EC PRIVATE KEY-----`;

TestRegister.addTests([
    {
        name: "JWT Sign: HS256",
        input: inputObject,
        expectedOutput: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJTdHJpbmciOiJTb21lU3RyaW5nIiwiTnVtYmVyIjo0MiwiaWF0IjoxfQ.0ha6-j4FwvEIKPVZ-hf3S_R9Hy_UtXzq4dnedXcUrXk",
        recipeConfig: [
            {
                op: "JWT Sign",
                args: [hsKey, "HS256", "{}"],
            }
        ],
    },
    {
        name: "JWT Sign: HS256 with custom header",
        input: inputObject,
        expectedOutput: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6ImN1c3RvbS5rZXkifQ.eyJTdHJpbmciOiJTb21lU3RyaW5nIiwiTnVtYmVyIjo0MiwiaWF0IjoxfQ.kXln8btJburfRlND8IDZAQ8NZGFFZhvHyooHa6N9za8",
        recipeConfig: [
            {
                op: "JWT Sign",
                args: [hsKey, "HS256", `{"kid":"custom.key"}`],
            }
        ],
    },
    {
        name: "JWT Sign: HS384",
        input: inputObject,
        expectedOutput: "eyJhbGciOiJIUzM4NCIsInR5cCI6IkpXVCJ9.eyJTdHJpbmciOiJTb21lU3RyaW5nIiwiTnVtYmVyIjo0MiwiaWF0IjoxfQ._bPK-Y3mIACConbJqkGFMQ_L3vbxgKXy9gSxtL9hA5XTganozTSXxD0vX0N1yT5s",
        recipeConfig: [
            {
                op: "JWT Sign",
                args: [hsKey, "HS384", "{}"],
            }
        ],
    },
    {
        name: "JWT Sign: HS512",
        input: inputObject,
        expectedOutput: "eyJhbGciOiJIUzUxMiIsInR5cCI6IkpXVCJ9.eyJTdHJpbmciOiJTb21lU3RyaW5nIiwiTnVtYmVyIjo0MiwiaWF0IjoxfQ.vZIJU4XYMFt3FLE1V_RZOxEetmV4RvxtPZQGzJthK_d47pjwlEb6pQE23YxHFmOj8H5RLEdqqLPw4jNsOyHRzA",
        recipeConfig: [
            {
                op: "JWT Sign",
                args: [hsKey, "HS512", "{}"],
            }
        ],
    },
    {
        name: "JWT Sign: ES256",
        input: inputObject,
        expectedOutput: inputObject,
        recipeConfig: [
            {
                op: "JWT Sign",
                args: [esKey, "ES256", "{}"],
            },
            {
                op: "JWT Decode",
                args: []
            }
        ],
    },
    {
        name: "JWT Sign: ES384",
        input: inputObject,
        expectedOutput: inputObject,
        recipeConfig: [
            {
                op: "JWT Sign",
                args: [es384Key, "ES384", "{}"],
            },
            {
                op: "JWT Decode",
                args: []
            }
        ],
    },
    {
        name: "JWT Sign: ES512",
        input: inputObject,
        expectedOutput: inputObject,
        recipeConfig: [
            {
                op: "JWT Sign",
                args: [es512Key, "ES512", "{}"],
            },
            {
                op: "JWT Decode",
                args: []
            }
        ],
    },
    {
        name: "JWT Sign: RS256",
        input: inputObject,
        expectedOutput: inputObject,
        recipeConfig: [
            {
                op: "JWT Sign",
                args: [rsKey, "RS256", "{}"],
            },
            {
                op: "JWT Decode",
                args: []
            }
        ],
    },
    {
        name: "JWT Sign: RS384",
        input: inputObject,
        expectedOutput: inputObject,
        recipeConfig: [
            {
                op: "JWT Sign",
                args: [rsKey, "RS384", "{}"],
            },
            {
                op: "JWT Decode",
                args: []
            }
        ],
    },
    {
        name: "JWT Sign: RS512",
        input: inputObject,
        expectedOutput: inputObject,
        recipeConfig: [
            {
                op: "JWT Sign",
                args: [rsKey, "RS512", "{}"],
            },
            {
                op: "JWT Decode",
                args: []
            }
        ],
    }
]);
