const { ethers } = require("ethers");
require("dotenv").config();
const fs = require("fs");
const readline = require("readline");

// Ambil beberapa private key dari .env
const PRIVATE_KEYS = [
    process.env.PRIVATE_KEY_1,
    process.env.PRIVATE_KEY_2,
    process.env.PRIVATE_KEY_3
].filter(key => key); // Filter untuk menghindari undefined

if (PRIVATE_KEYS.length === 0) {
    console.error("Harap isi setidaknya satu PRIVATE_KEY di file .env");
    process.exit(1);
}

const TEA_RPC_URL = "https://tea-sepolia.g.alchemy.com/public";
const provider = new ethers.JsonRpcProvider(TEA_RPC_URL);

// Buat array wallet
const wallets = PRIVATE_KEYS.map(key => new ethers.Wallet(key, provider));

// Fungsi untuk memilih wallet acak
const getRandomWallet = () => {
    return wallets[Math.floor(Math.random() * wallets.length)];
};

// Fungsi untuk mengacak array (Fisher-Yates Shuffle)
const shuffleArray = (array) => {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
};

// Fungsi untuk membaca alamat dari file dan mengacaknya
const readAddressesFromFile = (filePath) => {
    try {
        const addresses = fs.readFileSync(filePath, "utf8")
            .split("\n")
            .map(line => line.trim())
            .filter(line => line.length > 0);
        return shuffleArray(addresses); // Acak urutan alamat
    } catch (error) {
        console.error("Gagal membaca file alamat:", error);
        process.exit(1);
    }
};

// Fungsi untuk menghasilkan jumlah token acak antara 0.05 dan 0.2 TEA
const getRandomAmount = () => {
    const min = 0.05; // Minimum 0.05 TEA
    const max = 0.2;  // Maksimum 0.2 TEA
    return ethers.parseEther((Math.random() * (max - min) + min).toFixed(5));
};

// Fungsi untuk menghasilkan jeda acak antara 10 dan 20 detik
const getRandomDelay = () => {
    const minDelay = 10 * 1000; // 10 detik dalam milidetik
    const maxDelay = 20 * 1000; // 20 detik dalam milidetik
    return Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
};

// Fungsi untuk mengecek dan menunggu jeda 24 jam jika sudah 200 transaksi
let transactionCount = 0; // Counter global untuk melacak jumlah transaksi
const checkTransactionLimit = async () => {
    const MAX_TRANSACTIONS = 200; // Batas 200 transaksi
    const DELAY_24H = 24 * 60 * 60 * 1000; // 24 jam dalam milidetik

    if (transactionCount >= MAX_TRANSACTIONS) {
        console.log(`Batas ${MAX_TRANSACTIONS} transaksi tercapai. Menunggu 24 jam sebelum melanjutkan...`);
        await new Promise(resolve => setTimeout(resolve, DELAY_24H));
        transactionCount = 0; // Reset counter setelah 24 jam
    }
};

// Fungsi untuk mengambil input jumlah transaksi dari pengguna
const getTransactionCountInput = async () => {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise(resolve => {
        rl.question("Masukkan jumlah transaksi yang akan dilakukan (1-100): ", (input) => {
            const num = parseInt(input);
            if (isNaN(num) || num < 1 || num > 100) {
                console.log("Input tidak valid. Harap masukkan angka antara 1 dan 100.");
                rl.close();
                resolve(getTransactionCountInput()); // Minta input ulang jika invalid
            } else {
                rl.close();
                resolve(num);
            }
        });
    });
};

// Fungsi untuk mengirim TEA ke daftar alamat dari file dengan jeda
const sendTeaFromFile = async (addresses, maxTransactions) => {
    const totalTransactions = maxTransactions; // Jumlah transaksi yang dipilih pengguna
    console.log(`Mulai proses dengan total ${totalTransactions} transaksi.`);

    // Ambil hanya jumlah alamat sesuai maxTransactions
    const selectedAddresses = addresses.slice(0, maxTransactions);

    for (let address of selectedAddresses) {
        await checkTransactionLimit(); // Cek batas transaksi sebelum setiap transaksi

        if (!ethers.isAddress(address)) {
            console.error(`Alamat tidak valid. Melewati...`);
            continue;
        }

        const wallet = getRandomWallet();
        const walletIndex = wallets.indexOf(wallet) + 1; // Indeks wallet (1, 2, 3, ...)
        const amount = getRandomAmount();
        const delay = getRandomDelay();
        const transactionType = (transactionCount % 2 === 0) ? "tx 1" : "tx 2"; // Keterangan transaksi

        try {
            const tx = await wallet.sendTransaction({
                to: address,
                value: amount,
            });

            const amountInEther = ethers.formatEther(amount);
            console.log(`${transactionType}: Transaksi ${transactionCount + 1} dari ${totalTransactions} tx dari wallet ${walletIndex}. Mengirim ${amountInEther} TEA. Tx Hash: ${tx.hash}`);
            await tx.wait();

            transactionCount++; // Tambah counter transaksi
            console.log(`${transactionType}: Transaksi ${transactionCount} dari ${totalTransactions} tx dari wallet ${walletIndex} selesai. Menunggu ${delay/1000} detik untuk transaksi berikutnya...`);

            // Tunggu jeda acak sebelum transaksi berikutnya
            await new Promise(resolve => setTimeout(resolve, delay));
        } catch (error) {
            console.error(`${transactionType}: Transaksi ${transactionCount + 1} dari ${totalTransactions} tx dari wallet ${walletIndex} gagal:`, error);
            // Tunggu jeda sebelum mencoba lagi
            await new Promise(resolve => setTimeout(resolve, delay));
            continue; // Lanjut ke alamat berikutnya
        }
    }

    // Setelah semua alamat diproses, simpan log
    if (transactionCount > 0) {
        fs.writeFileSync("sent_addresses.txt", selectedAddresses.filter(addr => ethers.isAddress(addr)).join("\n"), "utf8");
        console.log("Daftar alamat yang sudah dikirim token disimpan di 'sent_addresses.txt'");
    }
};

(async () => {
    const addressesFile = "addresses.txt"; // Nama file yang berisi daftar alamat
    const addresses = readAddressesFromFile(addressesFile);

    if (addresses.length === 0) {
        console.error("Tidak ada alamat yang ditemukan di file.");
        process.exit(1);
    }

    console.log(`Ditemukan ${addresses.length} alamat yang akan diproses.`);

    // Minta input jumlah transaksi dari pengguna
    const maxTransactions = await getTransactionCountInput();

    // Jalankan fungsi dengan jumlah transaksi yang dipilih
    await sendTeaFromFile(addresses, maxTransactions);
})();
