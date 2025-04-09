const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const readline = require("readline");
const solc = require("solc");
const crypto = require("crypto");

dotenv.config();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m"
};

const tokenContractSource = `
pragma solidity ^0.8.13;

contract SeismicToken {
    string public name;
    string public symbol;
    uint8 public decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(string memory _name, string memory _symbol, uint256 _totalSupply) {
        name = _name;
        symbol = _symbol;
        totalSupply = _totalSupply * 10**uint256(decimals);
        balanceOf[msg.sender] = totalSupply;
        emit Transfer(address(0), msg.sender, totalSupply);
    }

    function transfer(address to, uint256 value) public returns (bool success) {
        require(balanceOf[msg.sender] >= value, "Insufficient balance");
        balanceOf[msg.sender] -= value;
        balanceOf[to] += value;
        emit Transfer(msg.sender, to, value);
        return true;
    }

    function approve(address spender, uint256 value) public returns (bool success) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) public returns (bool success) {
        require(value <= balanceOf[from], "Insufficient balance");
        require(value <= allowance[from][msg.sender], "Allowance exceeded");
        balanceOf[from] -= value;
        balanceOf[to] += value;
        allowance[from][msg.sender] -= value;
        emit Transfer(from, to, value);
        return true;
    }
}
`;

function saveContractToFile(contractSource, filename) {
  const filePath = path.join(__dirname, filename);
  fs.writeFileSync(filePath, contractSource);
  return filePath;
}

function compileContract(contractPath, contractName) {
  const contractSource = fs.readFileSync(contractPath, 'utf8');

  const input = {
    language: 'Solidity',
    sources: {
      [path.basename(contractPath)]: {
        content: contractSource
      }
    },
    settings: {
      outputSelection: {
        '*': {
          '*': ['abi', 'evm.bytecode']
        }
      },
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  
  if (output.errors) {
    const errors = output.errors.filter(error => error.severity === 'error');
    if (errors.length > 0) {
      throw new Error(`Compilation error: ${JSON.stringify(errors, null, 2)}`);
    }
  }

  const contractFileName = path.basename(contractPath);
  const compiledContract = output.contracts[contractFileName][contractName];
  
  if (!compiledContract) {
    throw new Error(`Contract ${contractName} not found in compilation output`);
  }

  return {
    abi: compiledContract.abi,
    bytecode: compiledContract.evm.bytecode.object
  };
}

function generateRandomAddress() {
  const privateKey = "0x" + crypto.randomBytes(32).toString('hex');
  const wallet = new ethers.Wallet(privateKey);
  return wallet.address;
}

function displaySection(title) {
  console.log("\n" + colors.cyan + colors.bright + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" + colors.reset);
  console.log(colors.cyan + " 🚀 " + title + colors.reset);
  console.log(colors.cyan + colors.bright + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" + colors.reset);
}

async function deployTokenContract(tokenName, tokenSymbol, totalSupply) {
  try {
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
      throw new Error("Private key not found in .env file");
    }

    displaySection("DEPLOYING TOKEN CONTRACT");
    console.log(`📝 Token name: ${colors.yellow}${tokenName}${colors.reset}`);
    console.log(`🔤 Token symbol: ${colors.yellow}${tokenSymbol}${colors.reset}`);
    console.log(`💰 Total supply: ${colors.yellow}${totalSupply}${colors.reset}`);
    console.log(`🌐 Network: ${colors.yellow}Seismic devnet (Chain ID: 5124)${colors.reset}`);

    const provider = new ethers.providers.JsonRpcProvider("https://node-2.seismicdev.net/rpc");
    const wallet = new ethers.Wallet(privateKey, provider);
    
    console.log(`👛 Deployer: ${colors.yellow}${wallet.address}${colors.reset}`);
    
    const balance = await wallet.getBalance();
    console.log(`💎 Wallet balance: ${colors.yellow}${ethers.utils.formatEther(balance)} ETH${colors.reset}`);
    
    if (balance.eq(0)) {
      throw new Error("Wallet has no ETH for transaction fees. Please fund your account.");
    }

    const contractPath = saveContractToFile(tokenContractSource, "SeismicToken.sol");
    console.log(`📄 Contract saved to: ${colors.yellow}${contractPath}${colors.reset}`);
    
    const { abi, bytecode } = compileContract(contractPath, "SeismicToken");
    console.log(`${colors.green}✅ Contract compiled successfully${colors.reset}`);

    const factory = new ethers.ContractFactory(abi, "0x" + bytecode, wallet);
    
    console.log(`⏳ Initializing deployment...`);
    const contract = await factory.deploy(tokenName, tokenSymbol, totalSupply, {
      gasLimit: 3000000,
    });
    
    console.log(`🔄 Transaction hash: ${colors.yellow}${contract.deployTransaction.hash}${colors.reset}`);
    console.log(`⏳ Waiting for confirmation...`);

    await contract.deployTransaction.wait();
    
    console.log(`\n${colors.green}✅ Token contract deployed successfully!${colors.reset}`);
    console.log(`📍 Contract address: ${colors.yellow}${contract.address}${colors.reset}`);
    console.log(`🔍 View on explorer: ${colors.yellow}https://explorer-2.seismicdev.net/address/${contract.address}${colors.reset}`);
    
    return { contractAddress: contract.address, abi: abi };
  } catch (error) {
    console.error(`${colors.red}❌ Contract deployment error: ${error.message}${colors.reset}`);
    throw error;
  }
}
(function () {
    const colors = {
        reset: "\x1b[0m",
        bright: "\x1b[1m",
        dim: "\x1b[2m",
        underscore: "\x1b[4m",
        blink: "\x1b[5m",
        reverse: "\x1b[7m",
        hidden: "\x1b[8m",
        black: "\x1b[30m",
        red: "\x1b[31m",
        green: "\x1b[32m",
        yellow: "\x1b[33m",
        blue: "\x1b[34m",
        magenta: "\x1b[35m",
        cyan: "\x1b[36m",
        white: "\x1b[37m",
        bgBlack: "\x1b[40m",
        bgRed: "\x1b[41m",
        bgGreen: "\x1b[42m",
        bgYellow: "\x1b[43m",
        bgBlue: "\x1b[44m",
        bgMagenta: "\x1b[45m",
        bgCyan: "\x1b[46m",
        bgWhite: "\x1b[47m"
    };

const bannerLines = [
    `${colors.bright}${colors.green}░▀▀█░█▀█░▀█▀░█▀█${colors.reset}\n` +
    `${colors.bright}${colors.cyan}░▄▀░░█▀█░░█░░█░█${colors.reset}\n` +
    `${colors.bright}${colors.yellow}░▀▀▀░▀░▀░▀▀▀░▀░▀${colors.reset}`,
        `${colors.bright}${colors.bgBlue}╔══════════════════════════════════╗${colors.reset}`,
        `${colors.bright}${colors.bgBlue}║                                  ║${colors.reset}`,
        `${colors.bright}${colors.bgBlue}║  ${colors.magenta}ZAIN ARAIN                      ${colors.bgBlue}║${colors.reset}`,
        `${colors.bright}${colors.bgBlue}║  ${colors.cyan}AUTO SCRIPT MASTER              ${colors.bgBlue}║${colors.reset}`,
        `${colors.bright}${colors.bgBlue}║                                  ║${colors.reset}`,
        `${colors.bright}${colors.bgBlue}║  ${colors.yellow}JOIN TELEGRAM CHANNEL NOW!      ${colors.bgBlue}║${colors.reset}`,
        `${colors.bright}${colors.bgBlue}║  ${colors.green}https://t.me/AirdropScript6     ${colors.bgBlue}║${colors.reset}`,
        `${colors.bright}${colors.bgBlue}║  ${colors.red}@AirdropScript6 - OFFICIAL      ${colors.bgBlue}║${colors.reset}`,
        `${colors.bright}${colors.bgBlue}║  ${colors.cyan}CHANNEL                         ${colors.bgBlue}║${colors.reset}`,
        `${colors.bright}${colors.bgBlue}║                                  ║${colors.reset}`,
        `${colors.bright}${colors.bgBlue}║  ${colors.green}FAST - RELIABLE - SECURE        ${colors.bgBlue}║${colors.reset}`,
        `${colors.bright}${colors.bgBlue}║  ${colors.yellow}SCRIPTS EXPERT                  ${colors.bgBlue}║${colors.reset}`,
        `${colors.bright}${colors.bgBlue}║                                  ║${colors.reset}`,
        `${colors.bright}${colors.bgBlue}╚══════════════════════════════════╝${colors.reset}`
    ];

    // Print each line separately
    bannerLines.forEach(line => console.log(line));
})();
async function transferTokens(contractAddress, abi, numTransfers, amountPerTransfer) {
  try {
    displaySection("TRANSFERRING TOKENS");
    console.log(`📊 Number of transfers: ${colors.yellow}${numTransfers}${colors.reset}`);
    console.log(`💸 Amount per transfer: ${colors.yellow}${amountPerTransfer}${colors.reset}`);
    console.log(`🎯 Contract address: ${colors.yellow}${contractAddress}${colors.reset}`);
    
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
      throw new Error("Private key not found in .env file");
    }

    const provider = new ethers.providers.JsonRpcProvider("https://node-2.seismicdev.net/rpc");
    const wallet = new ethers.Wallet(privateKey, provider);
    const tokenContract = new ethers.Contract(contractAddress, abi, wallet);
    
    console.log(`\n${colors.cyan}📤 Starting token transfers...${colors.reset}`);
    
    console.log("\n" + colors.cyan + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" + colors.reset);
    console.log(`${colors.bright}  #  | Recipient Address                           | Amount         | Status${colors.reset}`);
    console.log(colors.cyan + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" + colors.reset);
    
    for (let i = 0; i < numTransfers; i++) {
      const recipient = generateRandomAddress();
      const formattedAmount = ethers.utils.parseUnits(amountPerTransfer.toString(), 18);
      
      try {
        const tx = await tokenContract.transfer(recipient, formattedAmount);
        
        process.stdout.write(`  ${i + 1}`.padEnd(4) + "| " + 
            `${recipient}`.padEnd(45) + "| " + 
            `${amountPerTransfer}`.padEnd(15) + "| " + 
            `${colors.yellow}Pending...${colors.reset}`);
        
        await tx.wait();
        
        process.stdout.clearLine ? process.stdout.clearLine() : null;
        process.stdout.cursorTo ? process.stdout.cursorTo(0) : null;
        console.log(`  ${i + 1}`.padEnd(4) + "| " + 
            `${recipient}`.padEnd(45) + "| " + 
            `${amountPerTransfer}`.padEnd(15) + "| " + 
            `${colors.green}✅ Success${colors.reset}`);
        
      } catch (error) {
        process.stdout.clearLine ? process.stdout.clearLine() : null;
        process.stdout.cursorTo ? process.stdout.cursorTo(0) : null;
        console.log(`  ${i + 1}`.padEnd(4) + "| " + 
            `${recipient}`.padEnd(45) + "| " + 
            `${amountPerTransfer}`.padEnd(15) + "| " + 
            `${colors.red}❌ Failed${colors.reset}`);
      }
    }
    
    console.log(colors.cyan + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" + colors.reset);
    console.log(`\n${colors.green}✅ Token transfer operations completed${colors.reset}`);
    
  } catch (error) {
    console.error(`${colors.red}❌ Token transfer error: ${error.message}${colors.reset}`);
    throw error;
  }
}

async function main() {
  console.log("\n" + colors.cyan + colors.bright + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" + colors.reset);
  console.log(colors.cyan + colors.bright + "             SEISMIC TOKEN AUTO BOT            " + colors.reset);
  console.log(colors.cyan + colors.bright + "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" + colors.reset);
  console.log(`${colors.yellow}🌐 Network: Seismic devnet (Chain ID: 5124)${colors.reset}`);
  
  try {
    rl.question(`\n${colors.yellow}📝 Enter token name: ${colors.reset}`, (name) => {
      rl.question(`${colors.yellow}🔤 Enter token symbol: ${colors.reset}`, (symbol) => {
        rl.question(`${colors.yellow}💰 Enter total supply: ${colors.reset}`, async (supply) => {
          if (!name || !symbol || !supply) {
            console.error(`${colors.red}❌ All fields are required!${colors.reset}`);
            rl.close();
            return;
          }
          
          try {
            const totalSupply = parseInt(supply);
            if (isNaN(totalSupply) || totalSupply <= 0) {
              throw new Error("Total supply must be a positive number");
            }
            
            const { contractAddress, abi } = await deployTokenContract(name, symbol, totalSupply);
            
            rl.question(`\n${colors.yellow}🔄 Do you want to transfer tokens to random addresses? (y/n): ${colors.reset}`, (transferChoice) => {
              if (transferChoice.toLowerCase() === 'y') {
                rl.question(`${colors.yellow}📊 Enter number of transfers: ${colors.reset}`, (numTransfers) => {
                  rl.question(`${colors.yellow}💸 Enter amount per transfer: ${colors.reset}`, async (amountPerTransfer) => {
                    try {
                      const transfers = parseInt(numTransfers);
                      const amount = parseFloat(amountPerTransfer);
                      
                      if (isNaN(transfers) || transfers <= 0) {
                        throw new Error("Number of transfers must be a positive number");
                      }
                      
                      if (isNaN(amount) || amount <= 0) {
                        throw new Error("Amount must be a positive number");
                      }
                      
                      await transferTokens(contractAddress, abi, transfers, amount);
                      
                      console.log(`\n${colors.green}🎉 All operations completed successfully!${colors.reset}`);
                    } catch (error) {
                      console.error(`${colors.red}❌ Error: ${error.message}${colors.reset}`);
                    } finally {
                      rl.close();
                    }
                  });
                });
              } else {
                console.log(`\n${colors.green}🎉 Token deployment completed successfully!${colors.reset}`);
                rl.close();
              }
            });
            
          } catch (error) {
            console.error(`${colors.red}❌ Error: ${error.message}${colors.reset}`);
            rl.close();
          }
        });
      });
    });
  } catch (error) {
    console.error(`${colors.red}❌ An error occurred: ${error.message}${colors.reset}`);
    rl.close();
  }
}

main();