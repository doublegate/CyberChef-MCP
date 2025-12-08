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
MIIEuwIBADANBgkqhkiG9w0BAQEFAASCBKUwggShAgEAAoIBAQCtbDhqlAqNrsUI
aQnBr/uhCfx9s9/NS8VY3dNVGZ/QGQt66VEfUyyqKY9dkxs6GVr/rF2KyW6+YE2B
KZ3RMoQ1Sj3RYuAeulrE7txLNvtGxCYNCQ8BGjzT/PwNJuD1femHg7r4Asj8aAMH
2Soe/ItFz6QddSj12PKv+apFk/NiLHAcmVvnK2w54PMpLBZVyN4nvOkj4THnLv4b
mpahIe95oS5fFLobMmJM0cR/GhuXg2UzlHZeRzkGZI8JEZwKFvZbCHS2GqD/4RSj
NLGjpds4uizCDSO5j8ifPOHZUZT2iicGvzs7SgHVoY+naab16RFaaSoe4lMe89Qc
T6QvrgIxAgMBAAECgf8sXwQQQNByb8T54eYdKGm5SlTP1LXuUPStSBRKMcQx+jZ1
vDyFR0KmRvvndTwCIXqm7/L/D4rGKt2prnwyijpJaDVo3WN6eTPAL10t4WNpN8aE
j0zHe28UziWvN8NXDGAzzACKdCv4aKRd3bJpOzRnKDlVUCSqwldVrwthwfkDpO7B
RxBWLC9wV+j3tYBSNEGEJRTvvj08ie6SOSCjYimiryqJ5KVS6OfD3dpTQZwu1jvz
EuUHCYeaYSDUSwcBAwJaiLc5dZYzC3r8184cLaTYT6cuS1175oiedbFpF1GjBM/f
52ktXtBJCUgzi8rIpKIc9Zhy3rdNIniryxUnBGkCgYEA5y/tdeSEAJpCVkz97Tp9
/KadyOdHtzQPtvziQ/UvAVmfIIkqxs0Lvp/V2S54spdOpMx8JjTmbnXSMxVwsKIt
4EPPcBcwHlwHtZ0lVa3RuunW8omBceBsF0RjhAtrJ+Jed8m06KUCAZHUMXyWKskG
/7N0rXR/ItrJkcnKMm5+9v0CgYEAwAkprORqwSw1rTt4irLq0vbC5Ur2mBenad2g
GJZo9d4p6cn09GlK35KEQIzIvzkVzurG2I9DQTj876e47idE4dp5PEg/R2TM8XYj
tglveCf6r4EOcjnPl9/Cpp3jk0Wo9A1LpkzgdtzRA1hxzPZrL+r9cUy4h4klSPG7
K52eMEUCgYEA0cK7uvcPChjsza7nyoIC4+UtTqcCe+iBxa8ngS+KabguWG/8XwqW
eGw/tOGkY65DjeV3U5c16M2AXhc6+xj7dPsx0OtJHpKz8AXYZSfkHqqi+8blqzRL
/sRvYtSVckfDHP7n5RoqetAc7pWzDrj9X64s1GDaJf7LWzry+dUl3+UCgYATLNcM
fIJsZ420jouqzdLE3f74BlQ5O6Nr3sVtrxcr9dMZlSDwhtMDIA40o9onvft/fdH9
LdD5YkdfZtAAd8tZAge5DT3EUzxjn/hQ5QBMbzGI9MoMfdlMwPseyAVBX2NPe0Ri
hqqjM8lrHBnA7ZomXsCP36lNX1RpxDl8UXDKQQKBgAG9LIFcKz7KCeGUlofcU5vo
6yRykHUFd2InhGzvGEIn5eXhnQgqVsW7rkNeR8LVdNmrI4dYDb0aBFnb79IMMZtp
dbgUFn52OghTSamwaazd8M+iKLLBJTqDNZWaG+rw/wh0Gvt1jStpwKMz28AXECHd
k/0Pm7R4v1u0GYZ+VBZi
-----END PRIVATE KEY-----`;
const esKey = `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgevZzL1gdAFr88hb2
OF/2NxApJCzGCEDdfSp6VQO30hyhRANCAAQRWz+jn65BtOMvdyHKcvjBeBSDZH2r
1RTwjmYSi9R/zpBnuQ4EiMnCqfMPWiZqB4QdbAd0E7oH50VpuZ1P087G
-----END PRIVATE KEY-----`;
const es384Key = `-----BEGIN PRIVATE KEY-----
MIG2AgEAMBAGByqGSM49AgEGBSuBBAAiBIGeMIGbAgEBBDBxNOX3ru5/MwotXisD
P7l/sAJVYN5s1/aFRC8W+MNiZS12RLFEk5QHkCbvry2Vsw+hZANiAARrW07nrRxQ
KpAJoaKtt8QKc2Uvd52KaGTifu2VhY0umO+Mw9wnDNCnVSIg9QxYMsIhKv35uBJH
nl0scoW2o9AbHrTq2eTbh97xJeFB8VAPXBZZTVgiRjEfFpLzEiwZMEE=
-----END PRIVATE KEY-----`;
const es512Key = `-----BEGIN PRIVATE KEY-----
MIHuAgEAMBAGByqGSM49AgEGBSuBBAAjBIHWMIHTAgEBBEIB9NouOseFJkJdhFXQ
O4hKuqIOePpDY93Oa3w90MhPpbm+xOYWIlUaoRXymbDi0Ls7pzAXBDlxxmOKVKp9
4lK4uAChgYkDgYYABAH1KKkilLhZaT1a17LUR5X0cWbWpS98rKyb6BdBvMhgz3zn
jSA6KsMo/kjJnhgnttEAwZirfCkLQooxJYYG0bOpAQDhzAZdzlicwrMugJY4sz+U
Gv1Qnb70m+oX0zGctWdPT8N3lGVdMKRubgQB155H3nRVyPVlJCYcbb8ZExH5AuwF
mg==
-----END PRIVATE KEY-----`;

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
