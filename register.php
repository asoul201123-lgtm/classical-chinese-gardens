<?php
header('Content-Type: text/plain; charset=utf-8');

function get_param($key) {
    if (isset($_POST[$key])) return trim($_POST[$key]);
    if (isset($_GET[$key])) return trim($_GET[$key]);
    return '';
}

function count_char_types($password) {
    $count = 0;
    if (preg_match('/[a-zA-Z]/', $password)) $count++;
    if (preg_match('/\d/', $password)) $count++;
    if (preg_match('/[^a-zA-Z0-9]/', $password)) $count++;
    return $count;
}

function is_sequential_password($password) {
    $value = strtolower($password);
    $asc = '0123456789abcdefghijklmnopqrstuvwxyz';
    $desc = strrev($asc);
    return strpos($asc, $value) !== false || strpos($desc, $value) !== false;
}

function is_weak_password($password) {
    $value = trim($password);
    $lower = strtolower($value);
    $weakList = array(
        '12345678', '123456789', '1234567890',
        '87654321', '987654321', '9876543210',
        '11111111', '00000000', '66666666', '88888888',
        'password', 'password1', 'qwertyui', 'abcdefgh', 'abcdefg1'
    );

    if (in_array($lower, $weakList, true)) return true;
    if (preg_match('/^(.)\1{7,}$/u', $value)) return true;
    if (is_sequential_password($lower)) return true;
    if (count_char_types($value) < 2) return true;

    return false;
}

$username = get_param('username');
$password = get_param('password');

if ($username === '' || $password === '') {
    echo 'no';
    exit;
}

if (mb_strlen($password, 'UTF-8') < 8 || is_weak_password($password)) {
    echo 'no';
    exit;
}

// 评审专用账号固定保留，不允许普通注册覆盖。
if ($username === 'gjyg') {
    echo 'no';
    exit;
}

$usersFile = __DIR__ . '/users.json';
$users = array();

if (file_exists($usersFile)) {
    $json = file_get_contents($usersFile);
    $decoded = json_decode($json, true);
    if (is_array($decoded)) {
        $users = $decoded;
    }
}

if (isset($users[$username])) {
    echo 'no';
    exit;
}

$users[$username] = password_hash($password, PASSWORD_DEFAULT);
$result = file_put_contents(
    $usersFile,
    json_encode($users, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT),
    LOCK_EX
);

if ($result === false) {
    echo 'no';
} else {
    echo 'yes';
}
