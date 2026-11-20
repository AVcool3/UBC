/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/held_quote.json`.
 */
export type HeldQuote = {
  "address": "32LnKdWnNk93W4C1pD4s3DjdTUAw4aGZZr6tbRMpw8e3",
  "metadata": {
    "name": "heldQuote",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Price holds for binary outcome shares: buy now or hold an executable price, settled atomically on Solana"
  },
  "instructions": [
    {
      "name": "buyNow",
      "discriminator": [
        242,
        42,
        184,
        77,
        133,
        152,
        118,
        204
      ],
      "accounts": [
        {
          "name": "buyer",
          "writable": true,
          "signer": true
        },
        {
          "name": "market",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market.id",
                "account": "market"
              }
            ]
          },
          "relations": [
            "pool"
          ]
        },
        {
          "name": "pool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "pool.maker",
                "account": "pool"
              }
            ]
          }
        },
        {
          "name": "yesMint",
          "relations": [
            "market"
          ]
        },
        {
          "name": "collateralMint",
          "relations": [
            "market"
          ]
        },
        {
          "name": "yesVault",
          "writable": true,
          "relations": [
            "pool"
          ]
        },
        {
          "name": "proceedsVault",
          "writable": true,
          "relations": [
            "pool"
          ]
        },
        {
          "name": "buyerCollateral",
          "writable": true
        },
        {
          "name": "buyerYes",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "buyer"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "yesMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "qty",
          "type": "u64"
        },
        {
          "name": "maxPrice",
          "type": "u64"
        }
      ]
    },
    {
      "name": "claimProceeds",
      "discriminator": [
        44,
        76,
        121,
        111,
        124,
        251,
        237,
        5
      ],
      "accounts": [
        {
          "name": "maker",
          "signer": true,
          "relations": [
            "pool"
          ]
        },
        {
          "name": "pool",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "pool.market",
                "account": "pool"
              },
              {
                "kind": "account",
                "path": "maker"
              }
            ]
          }
        },
        {
          "name": "collateralMint"
        },
        {
          "name": "proceedsVault",
          "writable": true,
          "relations": [
            "pool"
          ]
        },
        {
          "name": "makerCollateral",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "createMarket",
      "discriminator": [
        103,
        226,
        97,
        235,
        200,
        188,
        251,
        254
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "params.id"
              }
            ]
          }
        },
        {
          "name": "collateralMint"
        },
        {
          "name": "yesMint",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  121,
                  101,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "noMint",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  110,
                  111
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "vault",
          "docs": [
            "Collateral backing every outstanding set."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "collateralMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "createMarketParams"
            }
          }
        }
      ]
    },
    {
      "name": "deposit",
      "discriminator": [
        242,
        35,
        198,
        137,
        82,
        225,
        242,
        182
      ],
      "accounts": [
        {
          "name": "maker",
          "signer": true,
          "relations": [
            "pool"
          ]
        },
        {
          "name": "pool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "pool.market",
                "account": "pool"
              },
              {
                "kind": "account",
                "path": "maker"
              }
            ]
          }
        },
        {
          "name": "yesMint"
        },
        {
          "name": "yesVault",
          "writable": true,
          "relations": [
            "pool"
          ]
        },
        {
          "name": "makerYes",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "shares",
          "type": "u64"
        }
      ]
    },
    {
      "name": "exercise",
      "discriminator": [
        144,
        79,
        103,
        64,
        241,
        78,
        80,
        174
      ],
      "accounts": [
        {
          "name": "buyer",
          "writable": true,
          "signer": true,
          "relations": [
            "hold"
          ]
        },
        {
          "name": "market",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market.id",
                "account": "market"
              }
            ]
          },
          "relations": [
            "pool"
          ]
        },
        {
          "name": "pool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "pool.maker",
                "account": "pool"
              }
            ]
          },
          "relations": [
            "hold"
          ]
        },
        {
          "name": "hold",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  111,
                  108,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "pool"
              },
              {
                "kind": "account",
                "path": "buyer"
              },
              {
                "kind": "account",
                "path": "hold.nonce",
                "account": "hold"
              }
            ]
          }
        },
        {
          "name": "yesMint",
          "relations": [
            "market"
          ]
        },
        {
          "name": "collateralMint",
          "relations": [
            "market"
          ]
        },
        {
          "name": "yesVault",
          "writable": true,
          "relations": [
            "pool"
          ]
        },
        {
          "name": "proceedsVault",
          "writable": true,
          "relations": [
            "pool"
          ]
        },
        {
          "name": "buyerCollateral",
          "writable": true
        },
        {
          "name": "buyerYes",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "buyer"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "yesMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "hold",
      "discriminator": [
        83,
        159,
        208,
        118,
        203,
        182,
        239,
        221
      ],
      "accounts": [
        {
          "name": "buyer",
          "writable": true,
          "signer": true
        },
        {
          "name": "market",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market.id",
                "account": "market"
              }
            ]
          },
          "relations": [
            "pool"
          ]
        },
        {
          "name": "pool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "pool.maker",
                "account": "pool"
              }
            ]
          }
        },
        {
          "name": "hold",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  111,
                  108,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "pool"
              },
              {
                "kind": "account",
                "path": "buyer"
              },
              {
                "kind": "arg",
                "path": "nonce"
              }
            ]
          }
        },
        {
          "name": "collateralMint",
          "relations": [
            "market"
          ]
        },
        {
          "name": "proceedsVault",
          "writable": true,
          "relations": [
            "pool"
          ]
        },
        {
          "name": "buyerCollateral",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "nonce",
          "type": "u64"
        },
        {
          "name": "qty",
          "type": "u64"
        },
        {
          "name": "holdSecs",
          "type": "u32"
        },
        {
          "name": "maxPrice",
          "type": "u64"
        },
        {
          "name": "maxFee",
          "type": "u64"
        }
      ]
    },
    {
      "name": "openPool",
      "discriminator": [
        96,
        215,
        110,
        61,
        1,
        246,
        205,
        228
      ],
      "accounts": [
        {
          "name": "maker",
          "writable": true,
          "signer": true
        },
        {
          "name": "market",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market.id",
                "account": "market"
              }
            ]
          }
        },
        {
          "name": "pool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "maker"
              }
            ]
          }
        },
        {
          "name": "yesMint",
          "relations": [
            "market"
          ]
        },
        {
          "name": "collateralMint",
          "relations": [
            "market"
          ]
        },
        {
          "name": "yesVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "pool"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "yesMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "proceedsVault",
          "docs": [
            "Where buyers' payments and hold fees land. Owned by the pool PDA so the",
            "maker can't close or swap it to block exercises; they claim from it instead."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "pool"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "collateralMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "terms",
          "type": {
            "defined": {
              "name": "poolTerms"
            }
          }
        }
      ]
    },
    {
      "name": "redeem",
      "discriminator": [
        184,
        12,
        86,
        149,
        70,
        196,
        97,
        225
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market.id",
                "account": "market"
              }
            ]
          }
        },
        {
          "name": "collateralMint",
          "relations": [
            "market"
          ]
        },
        {
          "name": "winningMint",
          "docs": [
            "Must be the winning side's mint."
          ],
          "writable": true
        },
        {
          "name": "vault",
          "writable": true,
          "relations": [
            "market"
          ]
        },
        {
          "name": "ownerWinning",
          "writable": true
        },
        {
          "name": "ownerCollateral",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "shares",
          "type": "u64"
        }
      ]
    },
    {
      "name": "release",
      "discriminator": [
        253,
        249,
        15,
        206,
        28,
        127,
        193,
        241
      ],
      "accounts": [
        {
          "name": "caller",
          "docs": [
            "Anyone. Pays only the transaction fee; receives nothing."
          ],
          "signer": true
        },
        {
          "name": "pool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "pool.market",
                "account": "pool"
              },
              {
                "kind": "account",
                "path": "pool.maker",
                "account": "pool"
              }
            ]
          },
          "relations": [
            "hold"
          ]
        },
        {
          "name": "hold",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  111,
                  108,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "pool"
              },
              {
                "kind": "account",
                "path": "hold.buyer",
                "account": "hold"
              },
              {
                "kind": "account",
                "path": "hold.nonce",
                "account": "hold"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "resolve",
      "discriminator": [
        246,
        150,
        236,
        206,
        108,
        63,
        58,
        10
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "market"
          ]
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market.id",
                "account": "market"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "outcome",
          "type": "u8"
        }
      ]
    },
    {
      "name": "setTerms",
      "discriminator": [
        198,
        18,
        197,
        226,
        220,
        230,
        87,
        173
      ],
      "accounts": [
        {
          "name": "maker",
          "signer": true,
          "relations": [
            "pool"
          ]
        },
        {
          "name": "pool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "pool.market",
                "account": "pool"
              },
              {
                "kind": "account",
                "path": "maker"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "terms",
          "type": {
            "defined": {
              "name": "poolTerms"
            }
          }
        }
      ]
    },
    {
      "name": "split",
      "discriminator": [
        124,
        189,
        27,
        43,
        216,
        40,
        147,
        66
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market.id",
                "account": "market"
              }
            ]
          }
        },
        {
          "name": "collateralMint",
          "relations": [
            "market"
          ]
        },
        {
          "name": "yesMint",
          "writable": true,
          "relations": [
            "market"
          ]
        },
        {
          "name": "noMint",
          "writable": true,
          "relations": [
            "market"
          ]
        },
        {
          "name": "vault",
          "writable": true,
          "relations": [
            "market"
          ]
        },
        {
          "name": "ownerCollateral",
          "writable": true
        },
        {
          "name": "ownerYes",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "yesMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "ownerNo",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "noMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "sets",
          "type": "u64"
        }
      ]
    },
    {
      "name": "withdraw",
      "discriminator": [
        183,
        18,
        70,
        156,
        148,
        109,
        161,
        34
      ],
      "accounts": [
        {
          "name": "maker",
          "signer": true,
          "relations": [
            "pool"
          ]
        },
        {
          "name": "pool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "pool.market",
                "account": "pool"
              },
              {
                "kind": "account",
                "path": "maker"
              }
            ]
          }
        },
        {
          "name": "yesMint"
        },
        {
          "name": "yesVault",
          "writable": true,
          "relations": [
            "pool"
          ]
        },
        {
          "name": "makerYes",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "shares",
          "type": "u64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "hold",
      "discriminator": [
        110,
        65,
        238,
        142,
        146,
        91,
        196,
        171
      ]
    },
    {
      "name": "market",
      "discriminator": [
        219,
        190,
        213,
        55,
        0,
        227,
        198,
        154
      ]
    },
    {
      "name": "pool",
      "discriminator": [
        241,
        154,
        109,
        4,
        17,
        177,
        109,
        188
      ]
    }
  ],
  "events": [
    {
      "name": "filled",
      "discriminator": [
        134,
        4,
        17,
        63,
        221,
        45,
        177,
        173
      ]
    },
    {
      "name": "holdCreated",
      "discriminator": [
        151,
        126,
        140,
        207,
        163,
        56,
        160,
        216
      ]
    },
    {
      "name": "holdReleased",
      "discriminator": [
        168,
        49,
        116,
        33,
        191,
        86,
        197,
        90
      ]
    },
    {
      "name": "inventoryChanged",
      "discriminator": [
        197,
        196,
        38,
        166,
        209,
        223,
        69,
        167
      ]
    },
    {
      "name": "marketCreated",
      "discriminator": [
        88,
        184,
        130,
        231,
        226,
        84,
        6,
        58
      ]
    },
    {
      "name": "marketResolved",
      "discriminator": [
        89,
        67,
        230,
        95,
        143,
        106,
        199,
        202
      ]
    },
    {
      "name": "redeemed",
      "discriminator": [
        14,
        29,
        183,
        71,
        31,
        165,
        107,
        38
      ]
    },
    {
      "name": "setsSplit",
      "discriminator": [
        122,
        80,
        239,
        51,
        203,
        114,
        74,
        4
      ]
    },
    {
      "name": "termsUpdated",
      "discriminator": [
        223,
        89,
        45,
        87,
        44,
        50,
        184,
        91
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "invalidPrice",
      "msg": "Price must be between $0.01 and $0.99, in whole cents"
    },
    {
      "code": 6001,
      "name": "invalidQuantity",
      "msg": "Quantity must be at least 1 share"
    },
    {
      "code": 6002,
      "name": "invalidHoldLength",
      "msg": "Hold length must be between 1 second and the pool's maximum"
    },
    {
      "code": 6003,
      "name": "priceAboveLimit",
      "msg": "The price is now above your maximum"
    },
    {
      "code": 6004,
      "name": "feeAboveLimit",
      "msg": "The hold fee is now above your maximum"
    },
    {
      "code": 6005,
      "name": "insufficientInventory",
      "msg": "Not enough shares available"
    },
    {
      "code": 6006,
      "name": "holdExpired",
      "msg": "This hold has expired"
    },
    {
      "code": 6007,
      "name": "holdNotExpired",
      "msg": "This hold hasn't expired yet"
    },
    {
      "code": 6008,
      "name": "holdNotActive",
      "msg": "This hold was already exercised or released"
    },
    {
      "code": 6009,
      "name": "marketClosed",
      "msg": "Trading is closed for this market"
    },
    {
      "code": 6010,
      "name": "holdPastClose",
      "msg": "The hold would outlast the market's trading window"
    },
    {
      "code": 6011,
      "name": "marketResolved",
      "msg": "This market is already resolved"
    },
    {
      "code": 6012,
      "name": "marketNotResolved",
      "msg": "This market isn't resolved yet"
    },
    {
      "code": 6013,
      "name": "invalidOutcome",
      "msg": "Outcome must be 1 (YES) or 2 (NO)"
    },
    {
      "code": 6014,
      "name": "selfTrade",
      "msg": "Makers can't buy from their own pool"
    },
    {
      "code": 6015,
      "name": "withdrawExceedsAvailable",
      "msg": "Can't withdraw shares that are reserved by holds"
    },
    {
      "code": 6016,
      "name": "closeTimeInPast",
      "msg": "Close time must be in the future"
    },
    {
      "code": 6017,
      "name": "textTooLong",
      "msg": "Text is too long"
    },
    {
      "code": 6018,
      "name": "wrongTokenAccount",
      "msg": "Token account doesn't match this market or pool"
    },
    {
      "code": 6019,
      "name": "overflow",
      "msg": "Arithmetic overflow"
    }
  ],
  "types": [
    {
      "name": "createMarketParams",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "id",
            "type": "u64"
          },
          {
            "name": "question",
            "type": "string"
          },
          {
            "name": "resolutionSource",
            "type": "string"
          },
          {
            "name": "reference",
            "type": "string"
          },
          {
            "name": "closeTime",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "filled",
      "docs": [
        "kind: 0 = immediate (buy_now), 1 = exercised hold."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "schemaVersion",
            "type": "u8"
          },
          {
            "name": "kind",
            "type": "u8"
          },
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "pool",
            "type": "pubkey"
          },
          {
            "name": "hold",
            "docs": [
              "Default pubkey for immediate buys."
            ],
            "type": "pubkey"
          },
          {
            "name": "buyer",
            "type": "pubkey"
          },
          {
            "name": "maker",
            "type": "pubkey"
          },
          {
            "name": "outcomeMint",
            "type": "pubkey"
          },
          {
            "name": "collateralMint",
            "type": "pubkey"
          },
          {
            "name": "qty",
            "type": "u64"
          },
          {
            "name": "price",
            "type": "u64"
          },
          {
            "name": "totalPaid",
            "type": "u64"
          },
          {
            "name": "termsSeq",
            "type": "u64"
          },
          {
            "name": "filledAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "hold",
      "docs": [
        "A held price: `qty` shares reserved for `buyer` at `price` until `expires_at`.",
        "seeds = [\"hold\", pool, buyer, nonce_le]",
        "",
        "Never closed: after settlement it stays on-chain as the receipt."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "pool",
            "type": "pubkey"
          },
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "maker",
            "type": "pubkey"
          },
          {
            "name": "buyer",
            "docs": [
              "The only wallet that can exercise."
            ],
            "type": "pubkey"
          },
          {
            "name": "nonce",
            "type": "u64"
          },
          {
            "name": "outcomeMint",
            "docs": [
              "What changes hands on exercise."
            ],
            "type": "pubkey"
          },
          {
            "name": "collateralMint",
            "type": "pubkey"
          },
          {
            "name": "side",
            "docs": [
              "0 = buy YES (the only side in this version)."
            ],
            "type": "u8"
          },
          {
            "name": "qty",
            "type": "u64"
          },
          {
            "name": "price",
            "docs": [
              "Held price, base units per share."
            ],
            "type": "u64"
          },
          {
            "name": "feePaid",
            "docs": [
              "Fee paid to the maker when the hold was written (non-refundable)."
            ],
            "type": "u64"
          },
          {
            "name": "termsSeq",
            "docs": [
              "Pool terms_seq at the moment of the hold."
            ],
            "type": "u64"
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "expiresAt",
            "docs": [
              "Exercise allowed while now < expires_at; release allowed when now >= expires_at."
            ],
            "type": "i64"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "holdStatus"
              }
            }
          },
          {
            "name": "settledAt",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "holdCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "schemaVersion",
            "type": "u8"
          },
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "pool",
            "type": "pubkey"
          },
          {
            "name": "hold",
            "type": "pubkey"
          },
          {
            "name": "buyer",
            "type": "pubkey"
          },
          {
            "name": "maker",
            "type": "pubkey"
          },
          {
            "name": "qty",
            "type": "u64"
          },
          {
            "name": "price",
            "type": "u64"
          },
          {
            "name": "feePaid",
            "type": "u64"
          },
          {
            "name": "termsSeq",
            "type": "u64"
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "expiresAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "holdReleased",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "schemaVersion",
            "type": "u8"
          },
          {
            "name": "pool",
            "type": "pubkey"
          },
          {
            "name": "hold",
            "type": "pubkey"
          },
          {
            "name": "buyer",
            "type": "pubkey"
          },
          {
            "name": "qty",
            "type": "u64"
          },
          {
            "name": "caller",
            "docs": [
              "Whoever sent the cleanup transaction (anyone may)."
            ],
            "type": "pubkey"
          },
          {
            "name": "releasedAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "holdStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "held"
          },
          {
            "name": "exercised"
          },
          {
            "name": "released"
          }
        ]
      }
    },
    {
      "name": "inventoryChanged",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "schemaVersion",
            "type": "u8"
          },
          {
            "name": "pool",
            "type": "pubkey"
          },
          {
            "name": "delta",
            "docs": [
              "Positive = deposit, negative = withdraw."
            ],
            "type": "i64"
          },
          {
            "name": "available",
            "type": "u64"
          },
          {
            "name": "reserved",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "market",
      "docs": [
        "A binary question with fully collateralized YES/NO share mints.",
        "seeds = [\"market\", id_le]"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "id",
            "type": "u64"
          },
          {
            "name": "admin",
            "docs": [
              "Creates the market and resolves it (test admin on devnet)."
            ],
            "type": "pubkey"
          },
          {
            "name": "collateralMint",
            "type": "pubkey"
          },
          {
            "name": "yesMint",
            "docs": [
              "PDA mints (authority = this market), 0 decimals."
            ],
            "type": "pubkey"
          },
          {
            "name": "noMint",
            "type": "pubkey"
          },
          {
            "name": "vault",
            "docs": [
              "Collateral backing every outstanding set (ATA owned by this market)."
            ],
            "type": "pubkey"
          },
          {
            "name": "question",
            "type": "string"
          },
          {
            "name": "resolutionSource",
            "docs": [
              "Where the answer comes from, in words (shown to buyers)."
            ],
            "type": "string"
          },
          {
            "name": "reference",
            "docs": [
              "Display-only reference contract this market mirrors (e.g. a Gemini symbol).",
              "Prices from it are never executable here."
            ],
            "type": "string"
          },
          {
            "name": "closeTime",
            "docs": [
              "Trading (buy_now / hold / exercise) stops at this unix time."
            ],
            "type": "i64"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "marketStatus"
              }
            }
          },
          {
            "name": "outcome",
            "docs": [
              "0 = unresolved, 1 = YES won, 2 = NO won."
            ],
            "type": "u8"
          },
          {
            "name": "setsOutstanding",
            "docs": [
              "Complete sets minted minus sets redeemed (each backed by SHARE_UNIT in the vault)."
            ],
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "marketCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "schemaVersion",
            "type": "u8"
          },
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "id",
            "type": "u64"
          },
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "collateralMint",
            "type": "pubkey"
          },
          {
            "name": "yesMint",
            "type": "pubkey"
          },
          {
            "name": "noMint",
            "type": "pubkey"
          },
          {
            "name": "closeTime",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "marketResolved",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "schemaVersion",
            "type": "u8"
          },
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "outcome",
            "type": "u8"
          },
          {
            "name": "resolvedAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "marketStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "open"
          },
          {
            "name": "resolved"
          }
        ]
      }
    },
    {
      "name": "pool",
      "docs": [
        "One maker's YES inventory for one market, held in program custody.",
        "seeds = [\"pool\", market, maker]",
        "",
        "Invariant (checked in tests): yes_vault balance == available + reserved."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "maker",
            "type": "pubkey"
          },
          {
            "name": "yesVault",
            "docs": [
              "YES shares in custody (ATA owned by this pool PDA)."
            ],
            "type": "pubkey"
          },
          {
            "name": "proceedsVault",
            "docs": [
              "Collateral account owned by this pool PDA; every payment and hold fee lands here.",
              "(Not the maker's own account: a maker could close that to make exercises fail.)"
            ],
            "type": "pubkey"
          },
          {
            "name": "ask",
            "docs": [
              "Executable ask for immediate buys and new holds (base units per share)."
            ],
            "type": "u64"
          },
          {
            "name": "holdRate",
            "docs": [
              "Hold fee in base units per share per minute (pro-rated per second, rounded up)."
            ],
            "type": "u64"
          },
          {
            "name": "maxHoldSecs",
            "docs": [
              "Longest hold this maker will write."
            ],
            "type": "u32"
          },
          {
            "name": "available",
            "docs": [
              "Shares anyone can buy or hold right now."
            ],
            "type": "u64"
          },
          {
            "name": "reserved",
            "docs": [
              "Shares locked by active holds (can only go to the hold's buyer, or back to `available`)."
            ],
            "type": "u64"
          },
          {
            "name": "soldNow",
            "type": "u64"
          },
          {
            "name": "soldHeld",
            "type": "u64"
          },
          {
            "name": "holdsCreated",
            "type": "u64"
          },
          {
            "name": "termsSeq",
            "docs": [
              "Bumps every time the maker changes terms; holds record the seq they were written at."
            ],
            "type": "u64"
          },
          {
            "name": "termsUpdatedAt",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "poolTerms",
      "docs": [
        "Terms a maker sets on their pool."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "ask",
            "type": "u64"
          },
          {
            "name": "holdRate",
            "type": "u64"
          },
          {
            "name": "maxHoldSecs",
            "type": "u32"
          }
        ]
      }
    },
    {
      "name": "redeemed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "schemaVersion",
            "type": "u8"
          },
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "shares",
            "type": "u64"
          },
          {
            "name": "collateralOut",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "setsSplit",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "schemaVersion",
            "type": "u8"
          },
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "sets",
            "type": "u64"
          },
          {
            "name": "collateralIn",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "termsUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "schemaVersion",
            "type": "u8"
          },
          {
            "name": "pool",
            "type": "pubkey"
          },
          {
            "name": "maker",
            "type": "pubkey"
          },
          {
            "name": "termsSeq",
            "type": "u64"
          },
          {
            "name": "ask",
            "type": "u64"
          },
          {
            "name": "holdRate",
            "type": "u64"
          },
          {
            "name": "maxHoldSecs",
            "type": "u32"
          },
          {
            "name": "updatedAt",
            "type": "i64"
          }
        ]
      }
    }
  ]
};
