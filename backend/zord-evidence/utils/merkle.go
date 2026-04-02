package utils

import "sort"

type MerkleLeaf struct {
	Index    int
	LeafHash string
}

func BuildMerkleRoot(leaves []MerkleLeaf) string {
	if len(leaves) == 0 {
		return SHA256Hex("empty")
	}

	sorted := make([]MerkleLeaf, len(leaves))
	copy(sorted, leaves)
	sort.Slice(sorted, func(i, j int) bool {
		if sorted[i].LeafHash == sorted[j].LeafHash {
			return sorted[i].Index < sorted[j].Index
		}
		return sorted[i].LeafHash < sorted[j].LeafHash
	})

	level := make([]string, len(sorted))
	for i, l := range sorted {
		level[i] = l.LeafHash
	}

	for len(level) > 1 {
		next := make([]string, 0, (len(level)+1)/2)
		for i := 0; i < len(level); i += 2 {
			left := level[i]
			right := left
			if i+1 < len(level) {
				right = level[i+1]
			}
			next = append(next, SHA256Hex(left+"|"+right))
		}
		level = next
	}

	return level[0]
}
