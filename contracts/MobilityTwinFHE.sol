// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract MobilityTwinFHE is SepoliaConfig {
    struct EncryptedMovement {
        uint256 id;
        euint32 encryptedCoordinates; // Encrypted x,y coordinates
        euint32 encryptedTimestamp;   // Encrypted movement timestamp
        euint32 encryptedSpeed;       // Encrypted movement speed
        euint32 encryptedDirection;   // Encrypted movement direction
        uint256 submissionTime;
    }
    
    struct DecryptedMovement {
        string coordinates;
        string timestamp;
        string speed;
        string direction;
        bool isRevealed;
    }

    uint256 public movementCount;
    mapping(uint256 => EncryptedMovement) public encryptedMovements;
    mapping(uint256 => DecryptedMovement) public decryptedMovements;
    
    mapping(string => euint32) private encryptedZoneCount;
    string[] private zoneList;
    
    mapping(uint256 => uint256) private requestToMovementId;
    
    event MovementAdded(uint256 indexed id, uint256 submissionTime);
    event SimulationRequested(uint256 indexed id);
    event MovementDecrypted(uint256 indexed id);
    
    modifier onlyAuthorized(uint256 movementId) {
        _;
    }
    
    function addEncryptedMovement(
        euint32 encryptedCoordinates,
        euint32 encryptedTimestamp,
        euint32 encryptedSpeed,
        euint32 encryptedDirection
    ) public {
        movementCount += 1;
        uint256 newId = movementCount;
        
        encryptedMovements[newId] = EncryptedMovement({
            id: newId,
            encryptedCoordinates: encryptedCoordinates,
            encryptedTimestamp: encryptedTimestamp,
            encryptedSpeed: encryptedSpeed,
            encryptedDirection: encryptedDirection,
            submissionTime: block.timestamp
        });
        
        decryptedMovements[newId] = DecryptedMovement({
            coordinates: "",
            timestamp: "",
            speed: "",
            direction: "",
            isRevealed: false
        });
        
        emit MovementAdded(newId, block.timestamp);
    }
    
    function requestMovementAnalysis(uint256 movementId) public onlyAuthorized(movementId) {
        EncryptedMovement storage movement = encryptedMovements[movementId];
        require(!decryptedMovements[movementId].isRevealed, "Already decrypted");
        
        bytes32[] memory ciphertexts = new bytes32[](4);
        ciphertexts[0] = FHE.toBytes32(movement.encryptedCoordinates);
        ciphertexts[1] = FHE.toBytes32(movement.encryptedTimestamp);
        ciphertexts[2] = FHE.toBytes32(movement.encryptedSpeed);
        ciphertexts[3] = FHE.toBytes32(movement.encryptedDirection);
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptMovement.selector);
        requestToMovementId[reqId] = movementId;
        
        emit SimulationRequested(movementId);
    }
    
    function decryptMovement(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 movementId = requestToMovementId[requestId];
        require(movementId != 0, "Invalid request");
        
        EncryptedMovement storage eMovement = encryptedMovements[movementId];
        DecryptedMovement storage dMovement = decryptedMovements[movementId];
        require(!dMovement.isRevealed, "Already decrypted");
        
        FHE.checkSignatures(requestId, cleartexts, proof);
        
        string[] memory results = abi.decode(cleartexts, (string[]));
        
        dMovement.coordinates = results[0];
        dMovement.timestamp = results[1];
        dMovement.speed = results[2];
        dMovement.direction = results[3];
        dMovement.isRevealed = true;
        
        string memory zone = calculateZone(dMovement.coordinates);
        if (FHE.isInitialized(encryptedZoneCount[zone]) == false) {
            encryptedZoneCount[zone] = FHE.asEuint32(0);
            zoneList.push(zone);
        }
        encryptedZoneCount[zone] = FHE.add(
            encryptedZoneCount[zone], 
            FHE.asEuint32(1)
        );
        
        emit MovementDecrypted(movementId);
    }
    
    function getDecryptedMovement(uint256 movementId) public view returns (
        string memory coordinates,
        string memory timestamp,
        string memory speed,
        string memory direction,
        bool isRevealed
    ) {
        DecryptedMovement storage m = decryptedMovements[movementId];
        return (m.coordinates, m.timestamp, m.speed, m.direction, m.isRevealed);
    }
    
    function getEncryptedZoneCount(string memory zone) public view returns (euint32) {
        return encryptedZoneCount[zone];
    }
    
    function requestZoneCountDecryption(string memory zone) public {
        euint32 count = encryptedZoneCount[zone];
        require(FHE.isInitialized(count), "Zone not found");
        
        bytes32[] memory ciphertexts = new bytes32[](1);
        ciphertexts[0] = FHE.toBytes32(count);
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptZoneCount.selector);
        requestToMovementId[reqId] = bytes32ToUint(keccak256(abi.encodePacked(zone)));
    }
    
    function decryptZoneCount(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 zoneHash = requestToMovementId[requestId];
        string memory zone = getZoneFromHash(zoneHash);
        
        FHE.checkSignatures(requestId, cleartexts, proof);
        
        uint32 count = abi.decode(cleartexts, (uint32));
    }
    
    function calculateZone(string memory coordinates) private pure returns (string memory) {
        return "Zone1"; // Simplified for example
    }
    
    function bytes32ToUint(bytes32 b) private pure returns (uint256) {
        return uint256(b);
    }
    
    function getZoneFromHash(uint256 hash) private view returns (string memory) {
        for (uint i = 0; i < zoneList.length; i++) {
            if (bytes32ToUint(keccak256(abi.encodePacked(zoneList[i]))) == hash) {
                return zoneList[i];
            }
        }
        revert("Zone not found");
    }
}