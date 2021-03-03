// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.7.5;


interface IDelegable {
    function addDelegate(address) external;
    function addDelegateBySignature(address, address, uint, uint8, bytes32, bytes32) external;
    function delegated(address, address) external view returns (bool);
}
